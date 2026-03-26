import React, { useState } from 'react';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'canvas' | 'database' | 'dashboard';
  setActiveTab: (tab: 'canvas' | 'database' | 'dashboard') => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-black text-black dark:text-white select-none">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        collapsed={collapsed} 
        setCollapsed={setCollapsed} 
      />
      <main className="flex-1 relative overflow-hidden flex flex-col">
        {/* Top Header */}
        <header className="h-14 border-b border-gray-100 dark:border-gray-900 flex items-center justify-between px-6 bg-white/80 dark:bg-black/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
              {activeTab}
            </span>
          </div>
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 flex items-center justify-center text-[10px] font-bold">
               JD
             </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 relative bg-gray-50/30 dark:bg-gray-950/30">
          {children}
        </div>
      </main>
    </div>
  );
};
