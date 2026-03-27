import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
  ScatterChart, Scatter, ZAxis
} from 'recharts';
import { useStore, CsvAnalysis } from '../../store/useStore';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { 
  Upload, BarChart2, PieChart as PieIcon, 
  TrendingUp, Settings2, Database as DbIcon,
  Plus, Trash2, Edit3, X, MousePointer2, Layers, Maximize
} from 'lucide-react';
import { listen } from '@tauri-apps/api/event';

const COLORS = [
  'var(--brand-1)', 
  'var(--brand-2)',
  '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'
];

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
  { id: 'bar', name: '막대', icon: <BarChart2 size={20} /> },
  { id: 'line', name: '꺾은선', icon: <TrendingUp size={20} /> },
  { id: 'pie', name: '파이', icon: <PieIcon size={20} /> },
  { id: 'scatter', name: '산점도', icon: <MousePointer2 size={20} /> },
  { id: 'histogram', name: '히스토그램', icon: <Layers size={20} /> }
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

  const getDisplaySubtitle = () => {
    // If user has set a custom subtitle, use it
    if (config.subtitle && config.subtitle !== 'Generated via CoFlux Insight Engine' && config.subtitle !== 'Click to add description') {
      return config.subtitle;
    }
    
    // Auto-generate from CSV stats if available
    if (config.dataSourceType === 'csv' && csvAnalysis?.stats) {
      // Find the first numeric column that is likely being plotted (usually 'value' or the first numeric one)
      const numericCols = Object.keys(csvAnalysis.stats);
      if (numericCols.length > 0) {
        // Simple heuristic: if there's a column named 'value', use it, otherwise use the first one
        const targetCol = numericCols.find(c => c.toLowerCase() === 'value') || numericCols[0];
        const stat = csvAnalysis.stats[targetCol];
        if (stat) {
          return `${targetCol} Stats: Avg ${stat.mean?.toFixed(1)} | Med ${stat.median?.toFixed(1)} | Range ${stat.min}~${stat.max}`;
        }
      }
    }
    
    return config.subtitle || 'Generated via CoFlux Insight Engine';
  };

  const displaySubtitle = getDisplaySubtitle();

  const renderChart = () => {
    return (
      <div className="h-[280px] w-full mt-2 flex items-center justify-center transition-all overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          {config.type === 'bar' || config.type === 'histogram' ? (
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barCategoryGap={config.type === 'histogram' ? 0 : '10%'}>
              <defs>
                <linearGradient id={`barGrad-${scopeId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand-1)" stopOpacity={1} />
                  <stop offset="100%" stopColor="var(--brand-2, var(--brand-1))" stopOpacity={0.8} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" opacity={0.3} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={10} tick={{ fill: 'var(--text-secondary)' }} />
              <YAxis axisLine={false} tickLine={false} fontSize={10} tick={{ fill: 'var(--text-secondary)' }} domain={[0, config.maxValue || 100]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  color: 'var(--text-primary)'
                }}
              />
              <Bar 
                dataKey="value" 
                fill={`url(#barGrad-${scopeId})`} 
                radius={config.type === 'histogram' ? [0, 0, 0, 0] : [4, 4, 0, 0]} 
                barSize={config.type === 'histogram' ? undefined : 24}
                onClick={() => setIsDataEditorOpen(true)}
                className="cursor-pointer hover:opacity-80 transition-opacity"
              />
            </BarChart>
          ) : config.type === 'line' ? (
            <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={`lineGrad-${scopeId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand-1)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="var(--brand-2, var(--brand-1))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" opacity={0.3} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={10} tick={{ fill: 'var(--text-secondary)' }} />
              <YAxis axisLine={false} tickLine={false} fontSize={10} tick={{ fill: 'var(--text-secondary)' }} domain={[0, config.maxValue || 100]} />
              <Tooltip />
              {/* Optional Area for premium look */}
              <Bar dataKey="value" fill={`url(#lineGrad-${scopeId})`} barSize={1000} isAnimationActive={false} />
              <Line 
                type="linear" 
                dataKey="value" 
                stroke="var(--brand-1, var(--text-primary))" 
                strokeWidth={3} 
                dot={{ r: 6, fill: "var(--brand-1, var(--text-primary))", stroke: 'var(--bg-primary)', strokeWidth: 2 }} 
                activeDot={{ r: 8, onClick: () => setIsDataEditorOpen(true), className: 'cursor-pointer' }}
                isAnimationActive={false}
                connectNulls
              />
            </LineChart>
          ) : config.type === 'scatter' ? (
            <ScatterChart margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.3} />
              <XAxis type="category" dataKey="name" name="Item" axisLine={false} tickLine={false} fontSize={10} tick={{ fill: 'var(--text-secondary)' }} />
              <YAxis type="number" dataKey="value" name="Value" axisLine={false} tickLine={false} fontSize={10} tick={{ fill: 'var(--text-secondary)' }} domain={[0, config.maxValue || 100]} />
              <ZAxis range={[60, 400]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Scatter 
                name="Data" 
                data={data} 
                fill="var(--brand-1)" 
                onClick={() => setIsDataEditorOpen(true)}
                className="cursor-pointer"
              >
                {data.map((_, index) => (
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
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="var(--bg-primary)" strokeWidth={2} className="hover:opacity-80 transition-opacity" />
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
      <div className="bg-bg-surface/90 backdrop-blur-xl border border-border-color rounded-2xl p-5 shadow-2xl animate-in zoom-in-95 duration-300" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] mb-4 text-center text-text-secondary opacity-40">Visualization Model Selection</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-w-4xl mx-auto">
          {CHART_TYPES.map(ct => (
            <button 
              key={ct.id}
              onClick={() => {
                setChartConfig(scopeId, { ...config, type: ct.id as any });
              }}
              className="flex flex-col items-center justify-center p-3 rounded-xl hover:bg-black/5 transition-all group border border-transparent hover:border-text-primary/10"
            >
              <div className="w-10 h-10 rounded-lg bg-text-primary/5 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                {ct.icon}
              </div>
              <span className="text-[10px] font-bold text-text-secondary">{ct.name}</span>
            </button>
          ))}
          {/* No filler items for shorter height */}
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
                  {displaySubtitle}
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
              <div className="bg-bg-secondary/5 border border-border-color rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-300" style={{ backgroundColor: 'var(--bg-secondary)', opacity: 0.95 }}>
                <div className="flex justify-between items-center mb-6">
                  <h4 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-text-primary"><Edit3 size={14}/> Manual Data Editor</h4>
                  <button onClick={() => setIsDataEditorOpen(false)} className="p-1 hover:bg-text-primary/10 rounded-full text-text-primary"><X size={16} /></button>
                </div>

                <div className="mb-6 p-4 bg-text-primary/5 rounded-xl border border-border-color">
                  <h5 className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2 text-text-primary">
                    <Maximize size={12} /> Chart Scale Settings
                  </h5>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-text-secondary">Set Max Value:</span>
                    <input 
                      type="number"
                      className="bg-bg-primary border border-border-color p-2 rounded-lg text-xs font-bold outline-none focus:border-primary w-24 text-text-primary"
                      value={config.maxValue || 100}
                      onChange={(e) => setChartConfig(scopeId, { ...config, maxValue: Math.max(1, Number(e.target.value) || 100) })}
                    />
                    <span className="text-[9px] font-bold text-text-secondary opacity-50 px-2 py-1 bg-text-primary/5 rounded uppercase">Default: 100</span>
                  </div>
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
                        className="col-span-8 bg-bg-primary border border-border-color p-2.5 rounded-lg text-xs font-bold outline-none focus:border-primary transition-all text-text-primary"
                        value={row.name}
                        onChange={(e) => {
                          const newData = [...(config.customData || DEFAULT_DATA)];
                          newData[idx] = { ...row, name: e.target.value };
                          setChartConfig(scopeId, { ...config, customData: newData, dataSourceType: 'manual' });
                        }}
                      />
                      <input 
                        className={`col-span-3 bg-bg-primary border p-2.5 rounded-lg text-xs font-bold outline-none transition-all ${isNaN(row.value) ? 'border-red-500 focus:border-red-600 bg-red-500/10' : 'border-border-color focus:border-primary'} text-text-primary`}
                        value={isNaN(row.value) ? '' : row.value}
                        placeholder="0"
                        onChange={(e) => {
                          const val = e.target.value;
                          const numVal = val === '' ? 0 : Number(val);
                          
                          // Prevent input if exceeds user-defined maxValue
                          const currentMax = config.maxValue || 100;
                          if (numVal > currentMax) return; 

                          const newData = [...(config.customData || DEFAULT_DATA)];
                          newData[idx] = { ...row, value: numVal };
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
