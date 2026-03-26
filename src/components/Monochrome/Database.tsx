import React from 'react';
import { useStore } from '../../store/useStore';
import { Table, Plus, MoreHorizontal } from 'lucide-react';

export const Database: React.FC = () => {
  const { tasks, fieldDefinitions } = useStore();

  return (
    <div className="p-8 h-full overflow-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-black text-black dark:text-white uppercase tracking-tighter">Database</h2>
          <p className="text-xs text-gray-400 mt-1 uppercase font-bold tracking-widest">Master Task List</p>
        </div>
        <button className="bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-lg font-bold text-sm hover:opacity-80 transition-all flex items-center gap-2">
          <Plus size={16} /> NEW TASK
        </button>
      </div>

      <div className="border border-gray-100 dark:border-gray-900 rounded-2xl bg-white dark:bg-black overflow-hidden shadow-2xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/50 dark:bg-gray-950/50 border-b border-gray-100 dark:border-gray-900">
              <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest">Name</th>
              {fieldDefinitions.map(field => (
                <th key={field.id} className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest">{field.name}</th>
              ))}
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={fieldDefinitions.length + 2} className="px-6 py-20 text-center text-gray-300 dark:text-gray-700 font-medium italic">
                  No tasks found. Create one from the whiteboard or database!
                </td>
              </tr>
            ) : (
              tasks.map(task => (
                <tr key={task.id} className="border-b border-gray-50 dark:border-gray-950 hover:bg-gray-50/30 dark:hover:bg-gray-950/30 transition-colors">
                  <td className="px-6 py-4 font-bold text-sm">{task.title}</td>
                  {fieldDefinitions.map(field => (
                    <td key={field.id} className="px-6 py-4 text-sm text-gray-500">
                      {task.customFields[field.id] || '-'}
                    </td>
                  ))}
                  <td className="px-6 py-4 text-right">
                    <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-900 rounded">
                      <MoreHorizontal size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
