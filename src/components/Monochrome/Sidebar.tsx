import React from 'react';
import { LayoutGrid, Database, Palette, Settings, Plus, ChevronLeft, ChevronRight } from 'lucide-react';

interface SidebarProps {
  activeTab: 'canvas' | 'database' | 'dashboard';
  setActiveTab: (tab: 'canvas' | 'database' | 'dashboard') => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, collapsed, setCollapsed }) => {
  const menuItems = [
    { id: 'canvas', icon: LayoutGrid, label: 'Whiteboard' },
    { id: 'database', icon: Database, label: 'Database' },
    { id: 'dashboard', icon: Palette, label: 'Dashboard' },
  ];

  return (
    <div className={`h-screen bg-white dark:bg-black border-r border-gray-200 dark:border-gray-800 transition-all duration-300 flex flex-col ${collapsed ? 'w-16' : 'w-64'}`}>
      <div className="p-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-900">
        {!collapsed && <h1 className="text-xl font-black tracking-tighter text-black dark:text-white">COFLUX</h1>}
        <button 
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-md transition-colors"
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center p-3 rounded-lg transition-all ${
                isActive 
                  ? 'bg-black text-white dark:bg-white dark:text-black shadow-lg scale-[1.02]' 
                  : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-950 hover:text-black dark:hover:text-white'
              }`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              {!collapsed && <span className="ml-3 font-semibold text-sm">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="p-2 border-t border-gray-100 dark:border-gray-900">
        <button className="w-full flex items-center p-3 rounded-lg text-gray-400 hover:text-black dark:hover:text-white transition-colors">
          <Settings size={20} />
          {!collapsed && <span className="ml-3 font-medium text-sm">Settings</span>}
        </button>
      </div>
    </div>
  );
};
