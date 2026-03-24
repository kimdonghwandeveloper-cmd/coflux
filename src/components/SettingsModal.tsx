import { useState } from 'react';
import { X, Palette, User, Layout, Sparkles } from 'lucide-react';
import { WorkspaceData } from '../App';
import { WorkspaceTheme } from '../lib/theme';
import { UserProfile } from '../lib/supabase';
import { AppearanceTab } from './Settings/AppearanceTab';
import { WorkspaceTab } from './Settings/WorkspaceTab';
import { AIPrivacyTab } from './Settings/AIPrivacyTab';
import { AccountTab } from './Settings/AccountTab';

export const SettingsModal = ({
  user,
  theme,
  toggleTheme,
  activeThemeId,
  savedCustomTheme,
  onThemeChange,
  activeWorkspace,
  onUpdateWorkspace,
  onClose,
}: {
  user: UserProfile | null;
  theme: string;
  toggleTheme: () => void;
  activeThemeId: string;
  savedCustomTheme?: WorkspaceTheme;
  onThemeChange: (themeId: string, customTheme?: WorkspaceTheme) => void;
  activeWorkspace: WorkspaceData | undefined;
  onUpdateWorkspace: (ws: WorkspaceData) => void;
  onClose: () => void;
}) => {
  const [activeTab, setActiveTab] = useState<'appearance' | 'workspace' | 'ai_privacy' | 'account'>('appearance');

  const TABS = [
    { id: 'appearance', label: 'Appearance', icon: <Palette size={14} /> },
    { id: 'workspace', label: 'Workspace', icon: <Layout size={14} /> },
    { id: 'ai_privacy', label: 'AI & Local Privacy', icon: <Sparkles size={14} /> },
    { id: 'account', label: 'Account & Plan', icon: <User size={14} /> },
  ] as const;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'slideUpFade 0.15s ease-out forwards' }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{ borderRadius: '12px', width: '640px', height: '520px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Settings</h2>
          <div onClick={onClose} style={{ cursor: 'pointer', padding: '4px', borderRadius: '4px' } as any}>
            <X size={18} color="var(--text-secondary)" />
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Sidebar Tabs */}
          <div style={{ width: '180px', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)', padding: '12px 8px' }}>
            {TABS.map(tab => (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: activeTab === tab.id ? 600 : 500,
                  color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: activeTab === tab.id ? 'var(--bg-surface)' : 'transparent',
                  cursor: 'pointer',
                  marginBottom: '2px',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.icon}
                {tab.label}
              </div>
            ))}
          </div>

          {/* Tab Content */}
          <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
            {activeTab === 'appearance' && (
              <AppearanceTab 
                theme={theme}
                toggleTheme={toggleTheme}
                activeThemeId={activeThemeId}
                savedCustomTheme={savedCustomTheme}
                onThemeChange={onThemeChange}
              />
            )}
            {activeTab === 'workspace' && activeWorkspace && (
              <WorkspaceTab 
                activeWorkspace={activeWorkspace}
                onUpdateWorkspace={onUpdateWorkspace}
              />
            )}
            {activeTab === 'ai_privacy' && <AIPrivacyTab />}
            {activeTab === 'account' && <AccountTab user={user} />}
          </div>
        </div>
      </div>
    </div>
  );
};
