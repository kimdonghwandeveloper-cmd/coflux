import { useMemo } from 'react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend 
} from 'recharts';
import { useStore } from '../../store/useStore';
import { Activity, CheckCircle2, AlertCircle, Clock, Zap } from 'lucide-react';

export const Dashboard = () => {
  const { tasks } = useStore();

  const statusData = useMemo(() => {
    const counts: Record<string, number> = { 'To Do': 0, 'In Progress': 0, 'Done': 0 };
    tasks.forEach(t => {
      const status = t.customFields.f_status || 'To Do';
      counts[status] = (counts[status] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [tasks]);

  const priorityData = useMemo(() => {
    const counts: Record<string, number> = { 'Low': 0, 'Medium': 0, 'High': 0 };
    tasks.forEach(t => {
      const priority = t.customFields.f_priority || 'Low';
      counts[priority] = (counts[priority] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [tasks]);

  const COLORS = ['#e5e5e5', '#737373', '#000000']; 

  return (
    <div className="flex-1 w-full h-full p-12 bg-transparent overflow-y-auto animate-in slide-in-from-bottom duration-700">
      <div className="max-w-6xl mx-auto">
        <header className="mb-14 flex items-center justify-between border-b border-border pb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Zap size={20} fill="currentColor" className="text-accent" />
              <h1 className="text-4xl font-black uppercase tracking-tighter leading-none">Command Center</h1>
            </div>
            <p className="text-[10px] font-bold text-secondary uppercase tracking-[0.4em]">Integrated Intelligence Analytics</p>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold text-secondary uppercase">Operational Status</div>
            <div className="flex items-center justify-end gap-2 text-[10px] uppercase font-black text-success mt-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
              </span>
              System Online
            </div>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          {[
            { label: 'Total Volume', value: tasks.length, icon: Activity, desc: 'Active tasks in DB' },
            { label: 'Active Pipeline', value: tasks.filter(t => t.customFields.f_status === 'In Progress').length, icon: Clock, desc: 'Work in progress' },
            { label: 'Archived Success', value: tasks.filter(t => t.customFields.f_status === 'Done').length, icon: CheckCircle2, desc: 'Completed goals' },
            { label: 'High Priority', value: tasks.filter(t => t.customFields.f_priority === 'High').length, icon: AlertCircle, desc: 'Critical focus' },
          ].map((stat, i) => (
            <div key={i} className="glass-panel p-6 rounded-2xl group hover:border-accent transition-all duration-300">
              <stat.icon size={20} className="mb-6 text-secondary group-hover:text-accent transition-colors" />
              <div className="text-[10px] font-black text-secondary uppercase tracking-widest mb-1">{stat.label}</div>
              <div className="text-3xl font-black tracking-tight mb-2">{stat.value}</div>
              <p className="text-[9px] font-bold text-secondary/40 uppercase tracking-tighter">{stat.desc}</p>
            </div>
          ))}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Status Distribution */}
          <div className="glass-panel p-8 rounded-2xl border border-border overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full -translate-y-16 translate-x-16"></div>
            <h3 className="text-xs font-black uppercase tracking-[0.3em] mb-10 flex items-center gap-3">
              <span className="w-1.5 h-1.5 bg-accent"></span> Status Distribution
            </h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                    animationBegin={0}
                    animationDuration={1500}
                  >
                    {statusData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', border: '1.5px solid #000', borderRadius: '8px', fontSize: '10px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                  />
                  <Legend iconType="circle" verticalAlign="bottom" height={36} formatter={(val) => <span className="text-[10px] font-black uppercase tracking-widest text-secondary">{val}</span>}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Priority Matrix */}
          <div className="glass-panel p-8 rounded-2xl border border-border">
            <h3 className="text-xs font-black uppercase tracking-[0.3em] mb-10 flex items-center gap-3">
              <span className="w-1.5 h-1.5 border border-accent"></span> Priority Matrix
            </h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priorityData}>
                  <XAxis 
                    dataKey="name" 
                    axisLine={{ stroke: 'rgba(0,0,0,0.1)' }} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 900 }} 
                  />
                  <YAxis 
                    axisLine={{ stroke: 'rgba(0,0,0,0.1)' }} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 900 }} 
                  />
                  <Tooltip 
                    cursor={{fill: 'rgba(0,0,0,0.02)'}}
                    contentStyle={{ backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', border: '1.5px solid #000', borderRadius: '8px', fontSize: '10px' }}
                  />
                  <Bar dataKey="value" fill="#000" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
