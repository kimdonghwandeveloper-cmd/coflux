import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
  ScatterChart, Scatter, ZAxis
} from 'recharts';
import { useStore, ChartConfig, CsvAnalysis } from '../../store/useStore';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { 
  Upload, BarChart2, PieChart as PieIcon, 
  TrendingUp, Settings2, Database as DbIcon,
  Plus, Trash2, Edit3, X, MousePointer2, Box, Layers
} from 'lucide-react';
import { listen } from '@tauri-apps/api/event';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const DEFAULT_DATA = [
  { name: 'Category 1', value: 45 },
  { name: 'Category 2', value: 32 },
  { name: 'Category 3', value: 58 },
];

interface ChartBlockProps {
  scopeId: string;
  initialType?: string;
}

const CHART_TYPES = [
  {
    id: 'bar',
    name: '막대 그래프 (Bar Chart)',
    desc: '서로 다른 항목 간의 수치를 비교할 때 최적입니다.',
    tip: '팁: 항목이 너무 많으면 가로 막대 그래프를 사용해 가독성을 높일 수 있습니다.',
    icon: <BarChart2 size={24} />
  },
  {
    id: 'line',
    name: '꺾은선 그래프 (Line Chart)',
    desc: '시간의 흐름에 따른 데이터의 추세(Trend)를 보여줍니다.',
    tip: '특징: 데이터의 연속성이 중요할 때 빛을 발합니다.',
    icon: <TrendingUp size={24} />
  },
  {
    id: 'pie',
    name: '파이 차트 (Pie Chart)',
    desc: '전체에서 각 부분이 차지하는 비율(Proportion)을 한눈에 보여줍니다.',
    tip: '주의: 항목이 5~6개 이상이면 적절히 묶어주는 게 좋습니다.',
    icon: <PieIcon size={24} />
  },
  {
    id: 'scatter',
    name: '산점도 (Scatter Plot)',
    desc: '두 변수 간의 상관관계를 점으로 나타낸 그래프입니다.',
    tip: '특징: 데이터가 얼마나 퍼져 있는지와 특정 패턴을 확인하기 좋습니다.',
    icon: <MousePointer2 size={24} />
  },
  {
    id: 'histogram',
    name: '히스토그램 (Histogram)',
    desc: '연속형 데이터의 분포를 나타냅니다.',
    tip: '특징: 데이터가 특정 구간에 얼마나 몰려 있는지 확인하는 데 사용됩니다.',
    icon: <Layers size={24} />
  }
];

export const ChartBlock: React.FC<ChartBlockProps> = ({ scopeId, initialType }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { 
    chartsByScope, 
    setChartConfig, 
    loadScopeData, 
    csvAnalysisByScope, 
    setCsvAnalysis,
    tasksByScope
  } = useStore();

  const config = chartsByScope[scopeId] || {
    type: (initialType as any) || 'uninitialized',
    title: 'New Analysis',
    subtitle: 'Generated via CoFlux Insight Engine',
    dataSourceType: 'database',
    sourceScopeId: '',
  };

  const csvAnalysis = csvAnalysisByScope[scopeId];
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDataEditorOpen, setIsDataEditorOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingSubtitle, setEditingSubtitle] = useState(false);

  useEffect(() => {
    loadScopeData(scopeId, 'chart');
    loadScopeData(scopeId, 'csv');

    let unlisten: any;
    const setupListener = async () => {
      unlisten = await listen('tauri://drag-drop', async (event: any) => {
        const { paths, position } = event.payload;
        if (paths.length > 0 && paths[0].endsWith('.csv')) {
          const { x, y } = position;
          const element = document.elementFromPoint(x, y);
          if (containerRef.current && (containerRef.current === element || containerRef.current.contains(element))) {
            await handleAnalyzeCsv(paths[0]);
          }
        }
      });
      
      await listen('tauri://drag-over', (event: any) => {
        const { position } = event.payload;
        const element = document.elementFromPoint(position.x, position.y);
        setIsDragging(containerRef.current?.contains(element) || false);
      });
    };
    setupListener();
    return () => { if (unlisten) unlisten(); };
  }, [scopeId, loadScopeData]);

  const handleAnalyzeCsv = async (path: string) => {
    try {
      setIsAnalyzing(true);
      const analysis = await invoke<CsvAnalysis>('coflux_analyze_csv', { path });
      setCsvAnalysis(scopeId, analysis);
      setChartConfig(scopeId, { ...config, dataSourceType: 'csv' });
      setIsSettingsOpen(false);
    } catch (err) {
      console.error("CSV Analysis failed:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePickFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      });
      if (typeof selected === 'string') {
        await handleAnalyzeCsv(selected);
      }
    } catch (err) {
      console.error("File picker failed:", err);
    }
  };

  const prepareData = () => {
    if (config.dataSourceType === 'csv' && csvAnalysis) {
      return csvAnalysis.sampleData;
    }
    
    if (config.dataSourceType === 'manual') {
      return config.customData && config.customData.length > 0 ? config.customData : DEFAULT_DATA;
    }
    
    // Database source
    const tasks = tasksByScope[config.sourceScopeId] || [];
    if (tasks.length === 0 && (config.dataSourceType === 'database' || !config.sourceScopeId)) {
      return config.customData && config.customData.length > 0 ? config.customData : DEFAULT_DATA;
    }

    const counts: Record<string, number> = {};
    tasks.forEach(t => {
      const status = t.customFields?.f_status || 'Unknown';
      counts[status] = (counts[status] || 0) + 1;
    });
    
    const dbData = Object.entries(counts).map(([name, value]) => ({ name, value }));
    return dbData.length > 0 ? dbData : (config.customData?.length ? config.customData : DEFAULT_DATA);
  };

  const data = prepareData();

  const renderChart = () => {
    return (
      <div className="h-[280px] w-full mt-2 flex items-center justify-center transition-all">
        <ResponsiveContainer width="100%" height="100%">
          {config.type === 'bar' || config.type === 'histogram' ? (
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barCategoryGap={config.type === 'histogram' ? 0 : '10%'}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.03)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={10} tick={{ fill: '#aaa' }} />
              <YAxis axisLine={false} tickLine={false} fontSize={10} tick={{ fill: '#aaa' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #eee',
                  borderRadius: '12px',
                  boxShadow: '0 8px 16px rgba(0,0,0,0.05)',
                  fontSize: '11px',
                  fontWeight: 'bold'
                }}
              />
              <Bar 
                dataKey="value" 
                fill="#111" 
                radius={config.type === 'histogram' ? [0, 0, 0, 0] : [4, 4, 0, 0]} 
                barSize={config.type === 'histogram' ? undefined : 24}
                onClick={() => setIsDataEditorOpen(true)}
                className="cursor-pointer hover:opacity-80 transition-opacity"
              />
            </BarChart>
          ) : config.type === 'line' ? (
            <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.03)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={10} tick={{ fill: '#aaa' }} />
              <YAxis axisLine={false} tickLine={false} fontSize={10} tick={{ fill: '#aaa' }} />
              <Tooltip />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#111" 
                strokeWidth={3} 
                dot={{ r: 4, fill: '#111', stroke: 'white', strokeWidth: 2 }} 
                activeDot={{ r: 6, onClick: () => setIsDataEditorOpen(true), className: 'cursor-pointer' }} 
              />
            </LineChart>
          ) : config.type === 'scatter' ? (
            <ScatterChart margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.03)" />
              <XAxis type="category" dataKey="name" name="Item" axisLine={false} tickLine={false} fontSize={10} tick={{ fill: '#aaa' }} />
              <YAxis type="number" dataKey="value" name="Value" axisLine={false} tickLine={false} fontSize={10} tick={{ fill: '#aaa' }} />
              <ZAxis range={[60, 400]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Scatter 
                name="Data" 
                data={data} 
                fill="#111" 
                onClick={() => setIsDataEditorOpen(true)}
                className="cursor-pointer"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Scatter>
            </ScatterChart>
          ) : (
            <PieChart>
              <Pie
                data={data}
                innerRadius={0}
                outerRadius={85}
                paddingAngle={0}
                dataKey="value"
                animationBegin={0}
                animationDuration={1000}
                onClick={() => setIsDataEditorOpen(true)}
                className="cursor-pointer"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="white" strokeWidth={2} className="hover:opacity-80 transition-opacity" />
                ))}
              </Pie>
              <Tooltip />
              <Legend 
                verticalAlign="bottom" 
                height={36} 
                iconType="circle" 
                wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', cursor: 'pointer' }}
                onClick={() => setIsDataEditorOpen(true)}
              />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    );
  };

  const renderSelector = () => {
    return (
      <div className="bg-white/90 backdrop-blur-xl border border-black/5 rounded-2xl p-8 shadow-2xl animate-in zoom-in-95 duration-300">
        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] mb-8 text-center opacity-40">Visualization Model Selection</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {CHART_TYPES.map(ct => (
            <button 
              key={ct.id}
              onClick={() => setChartConfig(scopeId, { ...config, type: ct.id as any })}
              className="group/item flex flex-col p-6 rounded-2xl border-2 border-transparent hover:border-black hover:bg-black/5 transition-all text-left h-full"
            >
              <div className="w-12 h-12 rounded-xl bg-black/5 flex items-center justify-center mb-4 group-hover/item:scale-110 group-hover/item:bg-primary group-hover/item:text-white transition-all">
                {ct.icon}
              </div>
              <h5 className="text-xs font-black uppercase tracking-widest mb-2 font-black">{ct.name}</h5>
              <p className="text-[9px] font-bold text-secondary opacity-60 leading-relaxed mb-4">{ct.desc}</p>
              <div className="mt-auto pt-4 border-t border-black/5">
                <p className="text-[8px] font-black uppercase tracking-wider text-primary opacity-0 group-hover/item:opacity-100 transition-opacity">
                  {ct.tip}
                </p>
              </div>
            </button>
          ))}
          {/* Missing items grid filler */}
          {[...Array(3)].map((_, i) => (
            <div key={i} className="p-6 rounded-2xl border-2 border-dashed border-black/5 flex items-center justify-center">
              <Plus size={24} className="opacity-10" />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div 
      ref={containerRef} 
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={`relative w-full p-4 transition-all duration-300 ${isDragging ? 'bg-primary/5 ring-2 ring-primary ring-inset rounded-xl' : 'bg-transparent'}`}
    >
      {config.type === 'uninitialized' ? renderSelector() : (
        <>
          {/* Header Area */}
          <div className="flex justify-between items-start group/header mb-4">
            <div className="flex-1 mr-4">
              {editingTitle ? (
                <input 
                  autoFocus
                  onMouseDown={(e) => e.stopPropagation()}
                  className="text-lg font-black tracking-tight uppercase border-b-2 border-primary bg-transparent outline-none w-full select-text"
                  value={config.title}
                  onChange={(e) => setChartConfig(scopeId, { ...config, title: e.target.value })}
                  onBlur={() => setEditingTitle(false)}
                  onKeyDown={(e) => e.key === 'Enter' && setEditingTitle(false)}
                />
              ) : (
                <h3 
                  onClick={() => setEditingTitle(true)}
                  className="text-lg font-black tracking-tight uppercase cursor-text hover:text-primary transition-colors"
                >
                  {config.title}
                </h3>
              )}
              
              {editingSubtitle ? (
                <input 
                  autoFocus
                  onMouseDown={(e) => e.stopPropagation()}
                  className="text-[10px] font-bold text-secondary uppercase tracking-widest border-b border-border bg-transparent outline-none w-full mt-1 select-text"
                  value={config.subtitle || ''}
                  onChange={(e) => setChartConfig(scopeId, { ...config, subtitle: e.target.value })}
                  onBlur={() => setEditingSubtitle(false)}
                  onKeyDown={(e) => e.key === 'Enter' && setEditingSubtitle(false)}
                />
              ) : (
                <p 
                  onClick={() => setEditingSubtitle(true)}
                  className="text-[10px] font-bold text-secondary uppercase tracking-widest opacity-60 cursor-text hover:opacity-100 transition-opacity mt-1"
                >
                  {config.subtitle || 'Click to add description'}
                </p>
              )}
            </div>
            
            <div className="flex gap-1 opacity-0 group-hover/header:opacity-100 transition-opacity">
              <button 
                onClick={() => setIsDataEditorOpen(!isDataEditorOpen)}
                className={`p-2 rounded-lg transition-colors ${isDataEditorOpen ? 'bg-primary text-white' : 'hover:bg-black/5'}`}
                title="Edit Data"
              >
                <Edit3 size={14} />
              </button>
              <button 
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className={`p-2 rounded-lg transition-colors ${isSettingsOpen ? 'bg-primary text-white' : 'hover:bg-black/5'}`}
                title="Settings"
              >
                <Settings2 size={14} />
              </button>
              <button 
                onClick={() => setChartConfig(scopeId, { ...config, type: 'uninitialized' })}
                className="p-2 rounded-lg hover:bg-black/5"
                title="Change Chart Type"
              >
                <Plus size={14} className="rotate-45" />
              </button>
            </div>
          </div>

          {/* Main Viewport - Integrated UI */}
          <div className="relative min-h-[300px]">
            {isAnalyzing ? (
              <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in">
                <TrendingUp size={48} className="animate-spin mb-4 text-primary" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] font-black">Polars analyzing data...</p>
              </div>
            ) : isSettingsOpen ? (
              <div className="bg-bg-secondary/5 border border-black/5 rounded-xl p-6 animate-in slide-in-from-top-4 duration-300">
                <div className="flex justify-between items-center mb-6">
                  <h4 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                    <Settings2 size={14} /> Configuration
                  </h4>
                  <button onClick={() => setIsSettingsOpen(false)} className="p-1 hover:bg-black/5 rounded-full"><X size={16} /></button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <label className="text-[9px] font-bold text-secondary uppercase tracking-widest">Source Type</label>
                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={() => setChartConfig(scopeId, { ...config, dataSourceType: 'database' })}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 text-[10px] font-black uppercase transition-all ${config.dataSourceType === 'database' ? 'border-primary bg-primary/5' : 'border-border bg-white'}`}
                      >
                        <DbIcon size={14} /> Database
                      </button>
                      <button 
                        onClick={() => setChartConfig(scopeId, { ...config, dataSourceType: 'manual' })}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 text-[10px] font-black uppercase transition-all ${config.dataSourceType === 'manual' ? 'border-primary bg-primary/5' : 'border-border bg-white'}`}
                      >
                        <Edit3 size={14} /> Manual Entry
                      </button>
                      <button 
                        onClick={() => setChartConfig(scopeId, { ...config, dataSourceType: 'csv' })}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 text-[10px] font-black uppercase transition-all ${config.dataSourceType === 'csv' ? 'border-primary bg-primary/5' : 'border-border bg-white'}`}
                      >
                        <Upload size={14} /> CSV Upload
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <label className="text-[9px] font-bold text-secondary uppercase tracking-widest">Visualization</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => setChartConfig(scopeId, { ...config, type: 'bar' })} className={`p-4 rounded-xl border-2 transition-all ${config.type === 'bar' ? 'border-primary bg-primary/5' : 'border-border bg-white'}`}><BarChart2 size={20} className="mx-auto" /></button>
                      <button onClick={() => setChartConfig(scopeId, { ...config, type: 'line' })} className={`p-4 rounded-xl border-2 transition-all ${config.type === 'line' ? 'border-primary bg-primary/5' : 'border-border bg-white'}`}><TrendingUp size={20} className="mx-auto" /></button>
                      <button onClick={() => setChartConfig(scopeId, { ...config, type: 'pie' })} className={`p-4 rounded-xl border-2 transition-all ${config.type === 'pie' ? 'border-primary bg-primary/5' : 'border-border bg-white'}`}><PieIcon size={20} className="mx-auto" /></button>
                    </div>
                  </div>
                </div>

                {config.dataSourceType === 'database' && (
                  <div className="mt-8 pt-6 border-t border-black/5">
                    <label className="text-[9px] font-bold text-secondary uppercase tracking-widest block mb-1">Target Object</label>
                    <select 
                      value={config.sourceScopeId}
                      onChange={(e) => setChartConfig(scopeId, { ...config, sourceScopeId: e.target.value })}
                      className="w-full bg-white border border-border rounded-lg p-3 text-[10px] font-bold uppercase outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="">Select Target...</option>
                      {Object.keys(tasksByScope).map(sid => (
                        <option key={sid} value={sid}>{sid === 'global' ? 'Global Inbox' : `Block: ${sid}`}</option>
                      ))}
                    </select>
                  </div>
                )}

                {config.dataSourceType === 'csv' && (
                  <div className="mt-8 pt-6 border-t border-black/5">
                    <div 
                      onClick={handlePickFile}
                      className="border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-primary hover:bg-primary/5 transition-all text-center group/drop bg-white"
                    >
                      <Upload className="mx-auto mb-2 group-hover/drop:scale-110 group-hover/drop:text-primary transition-transform" />
                      <p className="text-[10px] font-black uppercase tracking-widest">
                        {csvAnalysis ? `Analyzed: ${csvAnalysis.rowCount} rows` : 'Drop CSV or click to upload'}
                      </p>
                    </div>
                  </div>
                )}
                
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="w-full py-4 mt-8 bg-black text-white text-[11px] font-black uppercase tracking-widest rounded-xl shadow-lg hover:scale-[1.01] transition-all"
                >
                  Save Configuration
                </button>
              </div>
            ) : isDataEditorOpen ? (
              <div className="bg-bg-secondary/5 border border-black/5 rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex justify-between items-center mb-6">
                  <h4 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Edit3 size={14}/> Manual Data Editor</h4>
                  <button onClick={() => setIsDataEditorOpen(false)} className="p-1 hover:bg-black/5 rounded-full"><X size={16} /></button>
                </div>
                
                <div className="space-y-3">
                  <div className="grid grid-cols-12 gap-3 mb-2 px-3">
                    <div className="col-span-8 text-[9px] font-black uppercase tracking-widest text-secondary opacity-50">Category</div>
                    <div className="col-span-3 text-[9px] font-black uppercase tracking-widest text-secondary opacity-50">Value</div>
                    <div className="col-span-1"></div>
                  </div>
                  
                  {(config.customData || DEFAULT_DATA).map((row, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-3 items-center group/row animate-in slide-in-from-left-2 duration-200" style={{ animationDelay: `${idx * 40}ms` }}>
                      <input 
                        className="col-span-8 bg-white border border-border p-2.5 rounded-lg text-xs font-bold outline-none focus:border-primary transition-all"
                        value={row.name}
                        onChange={(e) => {
                          const newData = [...(config.customData || DEFAULT_DATA)];
                          newData[idx] = { ...row, name: e.target.value };
                          setChartConfig(scopeId, { ...config, customData: newData, dataSourceType: 'manual' });
                        }}
                      />
                      <input 
                        type="number"
                        className="col-span-3 bg-white border border-border p-2.5 rounded-lg text-xs font-bold outline-none focus:border-primary transition-all"
                        value={row.value}
                        onChange={(e) => {
                          const newData = [...(config.customData || DEFAULT_DATA)];
                          newData[idx] = { ...row, value: Number(e.target.value) };
                          setChartConfig(scopeId, { ...config, customData: newData, dataSourceType: 'manual' });
                        }}
                      />
                      <div className="col-span-1 flex justify-end">
                        <button 
                          onClick={() => {
                            const newData = (config.customData || DEFAULT_DATA).filter((_, i) => i !== idx);
                            setChartConfig(scopeId, { ...config, customData: newData, dataSourceType: 'manual' });
                          }}
                          className="p-2 text-secondary hover:text-red-500 opacity-60 hover:opacity-100 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  <button 
                    onClick={() => {
                      const newData = [...(config.customData || DEFAULT_DATA), { name: `Item ${ (config.customData || DEFAULT_DATA).length + 1 }`, value: 0 }];
                      setChartConfig(scopeId, { ...config, customData: newData, dataSourceType: 'manual' });
                    }}
                    className="w-full py-3 mt-4 border-2 border-dashed border-border rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2 bg-white/50"
                  >
                    <Plus size={14} /> Add New Row
                  </button>
                </div>
                
                <button 
                  onClick={() => { setIsDataEditorOpen(false); setChartConfig(scopeId, { ...config, dataSourceType: 'manual' }); }}
                  className="w-full py-4 mt-8 bg-black text-white text-[11px] font-black uppercase tracking-widest rounded-xl shadow-lg hover:scale-[1.01] transition-all"
                >
                  Done Editing
                </button>
              </div>
            ) : renderChart()}
          </div>

          {/* Footer Info */}
          <div className="mt-4 pt-4 border-t border-black/5 flex justify-between items-center text-[9px] font-bold text-secondary opacity-40 uppercase tracking-widest">
            <span>{config.dataSourceType === 'database' ? `Linked to ${config.sourceScopeId || 'None'}` : csvAnalysis ? `Source: ${csvAnalysis.rowCount} rows` : 'Standalone Model'}</span>
            <span>CoFlux Insight v2.1</span>
          </div>
        </>
      )}
    </div>
  );
};
