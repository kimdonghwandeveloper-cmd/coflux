import { useMemo } from 'react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend 
} from 'recharts';
import { useStore } from '../../store/useStore';
import { Activity, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

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

  const COLORS = ['#e5e5e5', '#737373', '#000000']; // Light Gray, Mid Gray, Black

  return (
    <div className="flex-1 w-full h-full p-8 bg-white dark:bg-black overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10">
          <h1 className="text-3xl font-black uppercase tracking-tighter">Command Center</h1>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-widest mt-1">Real-time Project Analytics / Monochrome</p>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="border border-black p-4 flex flex-col justify-between">
            <Activity size={18} className="mb-4" />
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase">Total Tasks</div>
              <div className="text-2xl font-black">{tasks.length}</div>
            </div>
          </div>
          <div className="border border-black p-4 flex flex-col justify-between">
            <Clock size={18} className="text-gray-400 mb-4" />
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase">In Progress</div>
              <div className="text-2xl font-black">{tasks.filter(t => t.customFields.f_status === 'In Progress').length}</div>
            </div>
          </div>
          <div className="border border-black p-4 flex flex-col justify-between">
            <CheckCircle2 size={18} className="mb-4" />
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase">Completed</div>
              <div className="text-2xl font-black">{tasks.filter(t => t.customFields.f_status === 'Done').length}</div>
            </div>
          </div>
          <div className="border border-black p-4 flex flex-col justify-between">
            <AlertCircle size={18} className="text-gray-400 mb-4" />
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase">High Priority</div>
              <div className="text-2xl font-black">{tasks.filter(t => t.customFields.f_priority === 'High').length}</div>
            </div>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Status Distribution */}
          <div className="border border-black p-6 bg-gray-50/50">
            <h3 className="text-xs font-black uppercase tracking-widest mb-6 flex items-center gap-2">
              <span className="w-2 h-2 bg-black"></span> Status Distribution
            </h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #000', borderRadius: 0, fontSize: '10px', fontStyle: 'bold' }}
                  />
                  <Legend iconType="rect" verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Priority Matrix */}
          <div className="border border-black p-6">
            <h3 className="text-xs font-black uppercase tracking-widest mb-6 flex items-center gap-2">
              <span className="w-2 h-2 bg-gray-400"></span> Priority Matrix
            </h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priorityData}>
                  <XAxis 
                    dataKey="name" 
                    axisLine={{ stroke: '#000' }} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 'bold' }} 
                  />
                  <YAxis 
                    axisLine={{ stroke: '#000' }} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 'bold' }} 
                  />
                  <Tooltip 
                    cursor={{fill: 'rgba(0,0,0,0.05)'}}
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #000', borderRadius: 0, fontSize: '10px' }}
                  />
                  <Bar dataKey="value" fill="#000" barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
