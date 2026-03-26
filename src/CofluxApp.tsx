import React, { useState } from 'react';
import { Layout } from './components/Monochrome/Layout';
import { Database } from './components/Monochrome/Database';
import { Dashboard } from './components/Monochrome/Dashboard';

// Temporary Canvas Placeholder
const CanvasPlaceholder = () => (
  <div className="h-full flex items-center justify-center bg-gray-50/30 dark:bg-gray-950/30">
    <div className="text-center">
      <h2 className="text-6xl font-black text-black/5 dark:text-white/5 uppercase tracking-tighter select-none">Whiteboard</h2>
      <p className="text-xs text-gray-400 mt-4 uppercase font-bold tracking-widest">Phase 3 Implementation Target</p>
    </div>
  </div>
);

const CofluxApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'canvas' | 'database' | 'dashboard'>('canvas');

  const renderContent = () => {
    switch (activeTab) {
      case 'canvas':
        return <CanvasPlaceholder />;
      case 'database':
        return <Database />;
      case 'dashboard':
        return <Dashboard />;
      default:
        return <CanvasPlaceholder />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {renderContent()}
    </Layout>
  );
};

export default CofluxApp;
