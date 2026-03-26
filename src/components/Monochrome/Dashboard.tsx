import React from 'react';
import { useStore } from '../../store/useStore';
import { LayoutGrid, AlertCircle } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { widgets } = useStore();

  return (
    <div className="p-8 h-full overflow-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-black text-black dark:text-white uppercase tracking-tighter">Insights</h2>
          <p className="text-xs text-gray-400 mt-1 uppercase font-bold tracking-widest">Data Visualization Hub</p>
        </div>
        <button className="border-2 border-black dark:border-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all">
          ADD WIDGET
        </button>
      </div>

      {widgets.length === 0 ? (
        <div className="h-[60vh] flex flex-col items-center justify-center border-2 border-dashed border-gray-100 dark:border-gray-900 rounded-3xl">
          <AlertCircle size={48} className="text-gray-200 dark:text-gray-800 mb-4" />
          <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">No widgets active</p>
          <p className="text-gray-300 dark:text-gray-700 text-xs mt-2">Add a widget to visualize your database fields.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {widgets.map(widget => (
            <div key={widget.id} className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-xl">
               <h3 className="font-black text-sm uppercase tracking-wider mb-4 border-b border-gray-50 dark:border-gray-950 pb-2">{widget.title}</h3>
               <div className="h-48 flex items-center justify-center bg-gray-50/50 dark:bg-gray-950/50 rounded-xl">
                  {/* Chart will go here in Phase 4 */}
                  <span className="text-[10px] text-gray-300 font-mono">CHART_PLACEHOLDER ({widget.type})</span>
               </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
