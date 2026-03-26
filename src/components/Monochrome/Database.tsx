import { useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { Plus, Search, Filter, MoreHorizontal, Calendar, CheckCircle2 } from 'lucide-react';

export const Database = ({ scopeId = 'global' }: { scopeId?: string }) => {
  const { fieldDefinitions, addTask, updateTask, getTasks, loadScopeData } = useStore();
  const tasks = getTasks(scopeId);

  useEffect(() => {
    if (scopeId) {
      loadScopeData(scopeId, 'tasks');
    }
  }, [scopeId, loadScopeData]);

  const handleAddTask = () => {
    addTask(scopeId, {
      id: `task_${Date.now()}`,
      title: 'New Task',
      description: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      customFields: { f_status: 'To Do' },
    });
  };

  return (
    <div className="flex-1 w-full h-full bg-transparent overflow-hidden flex flex-col p-8 animate-in fade-in duration-500">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-primary mb-2">
            {scopeId === 'global' ? 'Master Database' : 'Page Database'}
          </h1>
          <div className="flex items-center gap-4 text-xs font-medium text-secondary uppercase tracking-widest">
            <span className="flex items-center gap-1"><CheckCircle2 size={12} /> {tasks.length} Items</span>
            <span className="w-1 h-1 bg-border rounded-full"></span>
            <span>Scope: {scopeId}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="notion-btn px-4 py-2 flex items-center gap-2">
            <Search size={14} /> Search
          </button>
          <button className="notion-btn px-4 py-2 flex items-center gap-2">
            <Filter size={14} /> Filter
          </button>
          <button 
            onClick={handleAddTask}
            className="notion-btn primary px-4 py-2 flex items-center gap-2"
          >
            <Plus size={16} /> New Item
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto glass-panel rounded-xl border border-border shadow-2xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border bg-secondary/30 backdrop-blur-md sticky top-0 z-10">
              <th className="px-6 py-4 text-[11px] font-bold text-secondary uppercase tracking-widest w-12 text-center pointer-events-none">#</th>
              <th className="px-6 py-4 text-[11px] font-bold text-secondary uppercase tracking-widest min-w-[300px]">Title</th>
              {fieldDefinitions.map((fd) => (
                <th key={fd.id} className="px-6 py-4 text-[11px] font-bold text-secondary uppercase tracking-widest">
                  {fd.name}
                </th>
              ))}
              <th className="px-6 py-4 text-[11px] font-bold text-secondary uppercase tracking-widest w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {tasks.map((task, index) => (
              <tr key={task.id} className="group hover:bg-secondary/20 transition-colors">
                <td className="px-6 py-4 text-xs font-mono text-secondary opacity-40 text-center">{index + 1}</td>
                <td className="px-6 py-4">
                  <input
                    value={task.title}
                    onChange={(e) => updateTask(scopeId, task.id, { title: e.target.value })}
                    className="w-full bg-transparent border-none outline-none font-semibold text-sm focus:ring-1 focus:ring-accent/20 rounded px-1 -ml-1 transition-all"
                    placeholder="Empty title..."
                  />
                </td>
                {fieldDefinitions.map((fd) => (
                  <td key={fd.id} className="px-6 py-4">
                    {fd.type === 'status' ? (
                      <select
                        value={task.customFields[fd.id]}
                        onChange={(e) => updateTask(scopeId, task.id, { customFields: { ...task.customFields, [fd.id]: e.target.value } })}
                        className="bg-accent/5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 border border-border rounded-sm outline-none focus:border-accent transition-colors cursor-pointer"
                      >
                        {fd.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs text-secondary">{task.customFields[fd.id] || '-'}</span>
                    )}
                  </td>
                ))}
                <td className="px-6 py-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-1 hover:bg-border rounded transition-colors text-secondary">
                    <MoreHorizontal size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={fieldDefinitions.length + 3} className="px-6 py-20 text-center">
                  <div className="flex flex-col items-center gap-4 opacity-20">
                    <Plus size={48} />
                    <p className="text-sm font-bold uppercase tracking-widest">No Items Found</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      <footer className="mt-6 flex items-center justify-between text-[10px] font-bold text-secondary uppercase tracking-[0.2em]">
        <div className="flex items-center gap-4">
          <span>Row count: {tasks.length}</span>
          <span className="opacity-20">|</span>
          <span>Filtered: All</span>
        </div>
        <div className="flex items-center gap-2 opacity-40 hover:opacity-100 transition-opacity cursor-help">
          <Calendar size={12} /> Last updated today at {new Date().getHours()}:00
        </div>
      </footer>
    </div>
  );
};
