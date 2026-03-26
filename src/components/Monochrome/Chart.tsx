import React, { useState, useEffect, useCallback } from 'react';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend 
} from 'recharts';
import { useStore, ChartConfig, CsvAnalysis } from '../../store/useStore';
import { invoke } from '@tauri-apps/api/core';
import { 
  Upload, BarChart2, PieChart as PieIcon, 
  TrendingUp, Settings2, Database as DbIcon,
  Search
} from 'lucide-react';
import { listen } from '@tauri-apps/api/event';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const DEFAULT_DATA = [
  { name: 'Example 1', value: 45 },
  { name: 'Example 2', value: 32 },
  { name: 'Example 3', value: 58 },
  { name: 'Example 4', value: 24 },
];

export const ChartBlock: React.FC<{ scopeId: string }> = ({ scopeId }) => {
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
    type: 'bar',
    title: 'New Analysis',
    dataSourceType: 'database',
    sourceScopeId: '',
  };

  const csvAnalysis = csvAnalysisByScope[scopeId];
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    loadScopeData(scopeId, 'chart');
    loadScopeData(scopeId, 'csv');

    let unlisten: any;
    const setupListener = async () => {
      console.log("[Chart] Setting up drag-drop listener for", scopeId);
      unlisten = await listen('tauri://drag-drop', async (event: any) => {
        const { paths, position } = event.payload;
        if (paths.length > 0 && paths[0].endsWith('.csv')) {
          const { x, y } = position;
          // Use document.elementFromPoint for more robust hit testing
          const element = document.elementFromPoint(x, y);
          if (containerRef.current && (containerRef.current === element || containerRef.current.contains(element))) {
            console.log("[Chart] Hit SUCCESS! Analyzing:", paths[0]);
            await handleAnalyzeCsv(paths[0]);
          }
        }
      });
      
      // Also listen for drag-over to show visual feedback
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



  const prepareData = () => {
    if (config.dataSourceType === 'csv' && csvAnalysis) {
      return csvAnalysis.sampleData;
    }
    
    // Database source
    const tasks = tasksByScope[config.sourceScopeId] || [];
    if (tasks.length === 0 && config.dataSourceType === 'database' && !config.sourceScopeId) {
      return DEFAULT_DATA;
    }

    const counts: Record<string, number> = {};
    tasks.forEach(t => {
      const status = t.customFields?.f_status || 'Unknown';
      counts[status] = (counts[status] || 0) + 1;
    });
    
    const dbData = Object.entries(counts).map(([name, value]) => ({ name, value }));
    return dbData.length > 0 ? dbData : DEFAULT_DATA;
  };

  const data = prepareData();

  const renderChart = () => {
    if (!data || data.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-border rounded-xl opacity-50">
          <TrendingUp size={48} className="mb-4" />
          <p className="text-xs font-bold uppercase tracking-widest">No data to visualize</p>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="mt-4 px-4 py-2 bg-primary text-bg-primary text-[10px] font-black uppercase tracking-widest rounded-lg"
          >
            Configure Source
          </button>
        </div>
      );
    }

    return (
      <div className="h-[300px] w-full mt-4 flex items-center justify-center">
        <ResponsiveContainer width="99%" height="100%">
          {config.type === 'bar' ? (
            <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={10} tick={{ fill: '#888' }} />
              <YAxis axisLine={false} tickLine={false} fontSize={10} tick={{ fill: '#888' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #eee',
                  borderRadius: '8px',
                  fontSize: '10px'
                }}
              />
              <Bar dataKey="value" fill="#000" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : config.type === 'line' ? (
            <LineChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={10} tick={{ fill: '#888' }} />
              <YAxis axisLine={false} tickLine={false} fontSize={10} tick={{ fill: '#888' }} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#000" strokeWidth={3} dot={{ r: 6, fill: '#000' }} />
            </LineChart>
          ) : (
            <PieChart>
              <Pie
                data={data}
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" height={36} iconType="circle" />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="glass-panel p-6 my-4 group relative min-h-[300px] animate-in fade-in duration-700">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-xl font-black tracking-tighter uppercase italic">{config.title}</h3>
          <p className="text-[10px] font-bold text-secondary uppercase tracking-[0.2em] opacity-60">
            {config.dataSourceType === 'database' ? 'Live Database Sync' : 'Static CSV Analysis'}
          </p>
        </div>
        <button 
          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          className="p-2 hover:bg-black/5 rounded-full transition-colors opacity-0 group-hover:opacity-100"
        >
          <Settings2 size={18} />
        </button>
      </div>

      {isSettingsOpen ? (
        <div className="space-y-6 animate-in slide-in-from-top-4 duration-500">
          <div className="grid grid-cols-3 gap-4">
            <button 
              onClick={() => setChartConfig(scopeId, { ...config, type: 'bar' })}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${config.type === 'bar' ? 'border-primary bg-primary/5' : 'border-transparent hover:border-black/5'}`}
            >
              <BarChart2 size={24} />
              <span className="text-[9px] font-black uppercase tracking-widest">Bar</span>
            </button>
            <button 
              onClick={() => setChartConfig(scopeId, { ...config, type: 'line' })}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${config.type === 'line' ? 'border-primary bg-primary/5' : 'border-transparent hover:border-black/5'}`}
            >
              <TrendingUp size={24} />
              <span className="text-[9px] font-black uppercase tracking-widest">Line</span>
            </button>
            <button 
              onClick={() => setChartConfig(scopeId, { ...config, type: 'pie' })}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${config.type === 'pie' ? 'border-primary bg-primary/5' : 'border-transparent hover:border-black/5'}`}
            >
              <PieIcon size={24} />
              <span className="text-[9px] font-black uppercase tracking-widest">Doughnut</span>
            </button>
          </div>

          <div className="space-y-4">
            <label className="text-[9px] font-bold text-secondary uppercase tracking-widest">Data Source</label>
            <div className="flex gap-2">
              <button 
                onClick={() => setChartConfig(scopeId, { ...config, dataSourceType: 'database' })}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 transition-all ${config.dataSourceType === 'database' ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <DbIcon size={14} /> <span className="text-[10px] font-black uppercase tracking-widest">Database</span>
              </button>
              <button 
                onClick={() => setChartConfig(scopeId, { ...config, dataSourceType: 'csv' })}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 transition-all ${config.dataSourceType === 'csv' ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <Upload size={14} /> <span className="text-[10px] font-black uppercase tracking-widest">CSV Import</span>
              </button>
            </div>
            
            {config.dataSourceType === 'database' && (
              <select 
                value={config.sourceScopeId}
                onChange={(e) => setChartConfig(scopeId, { ...config, sourceScopeId: e.target.value })}
                className="w-full bg-black/5 border-none rounded-lg p-3 text-[10px] font-bold uppercase tracking-widest outline-none"
              >
                <option value="">Select Database Block...</option>
                {Object.keys(tasksByScope).map(sid => (
                  <option key={sid} value={sid}>{sid === 'global' ? 'Global Inbox' : `Block: ${sid}`}</option>
                ))}
              </select>
            )}

            {config.dataSourceType === 'csv' && (
              <div 
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 transition-all ${isDragging ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                {isAnalyzing ? (
                  <TrendingUp className="animate-spin" />
                ) : (
                  <Upload className={isDragging ? 'animate-bounce' : ''} />
                )}
                <p className="text-[10px] font-black uppercase tracking-widest text-center">
                  {isAnalyzing ? 'Polars analyzing data...' : csvAnalysis ? `Analyzed: ${csvAnalysis.rowCount} rows` : 'Drop CSV file here'}
                </p>
              </div>
            )}
          </div>

          <button 
            onClick={() => setIsSettingsOpen(false)}
            className="w-full py-4 bg-black text-white text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-xl"
          >
            Apply Configuration
          </button>
        </div>
      ) : renderChart()}
    </div>
  );
};
