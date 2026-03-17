import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Moon, Sun, X, Key, Check, Trash2, Eye, EyeOff } from 'lucide-react';
import { WorkspaceData } from '../App';

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { id: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...' },
] as const;
type ProviderId = (typeof PROVIDERS)[number]['id'];

function ApiKeyRow({ provider, label, placeholder }: { provider: ProviderId; label: string; placeholder: string }) {
  const [registered, setRegistered] = useState(false);
  const [input, setInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<boolean>('coflux_has_api_key', { provider })
      .then(setRegistered)
      .catch(() => {});
  }, [provider]);

  const save = async () => {
    if (!input.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await invoke('coflux_register_api_key', { provider, apiKey: input.trim() });
      setRegistered(true);
      setInput('');
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setError(null);
    try {
      await invoke('coflux_delete_api_key', { provider });
      setRegistered(false);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Key size={13} color="var(--text-secondary)" />
          <span style={{ fontSize: '14px', fontWeight: 500 }}>{label}</span>
        </div>
        {registered && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Check size={13} color="#22c55e" />
            <span style={{ fontSize: '12px', color: '#22c55e' }}>등록됨</span>
            <div
              onClick={remove}
              style={{ cursor: 'pointer', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Trash2 size={11} color="var(--text-secondary)" />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>삭제</span>
            </div>
          </div>
        )}
      </div>

      {!registered && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
              placeholder={placeholder}
              style={{ width: '100%', padding: '6px 32px 6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
            />
            <div
              onClick={() => setShowKey(v => !v)}
              style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', opacity: 0.5 }}
            >
              {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
            </div>
          </div>
          <button
            onClick={save}
            disabled={saving || !input.trim()}
            style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#3b82f6', color: '#fff', fontSize: '13px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving || !input.trim() ? 0.5 : 1 }}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      )}

      {error && <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#ef4444' }}>{error}</p>}
    </div>
  );
}

export const SettingsModal = ({
  theme,
  toggleTheme,
  activeWorkspace,
  onUpdateWorkspace,
  onClose,
}: {
  theme: string;
  toggleTheme: () => void;
  activeWorkspace: WorkspaceData | undefined;
  onUpdateWorkspace: (ws: WorkspaceData) => void;
  onClose: () => void;
}) => {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'slideUpFade 0.15s ease-out forwards' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-primary)', borderRadius: '12px', width: '480px', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 16px 48px rgba(0,0,0,0.2)', border: '1px solid var(--border-color)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 16px', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Settings</h2>
          <div onClick={onClose} style={{ cursor: 'pointer', padding: '4px' }}>
            <X size={18} color="var(--text-secondary)" />
          </div>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Appearance */}
          <div style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Appearance</h3>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
              <span style={{ fontSize: '14px' }}>Theme</span>
              <div onClick={toggleTheme} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 12px', borderRadius: '6px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
                <span style={{ fontSize: '13px' }}>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
              </div>
            </div>
          </div>

          {/* Workspace */}
          {activeWorkspace && (
            <div style={{ marginBottom: '28px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Workspace</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
                <span style={{ fontSize: '14px', minWidth: '80px' }}>Name</span>
                <input
                  value={activeWorkspace.name}
                  onChange={e => onUpdateWorkspace({ ...activeWorkspace, name: e.target.value, icon: e.target.value.charAt(0).toUpperCase() })}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}
                />
              </div>
            </div>
          )}

          {/* AI API Keys (BYOK) */}
          <div style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>AI API Keys</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px' }}>외부 AI 태스크에 사용됩니다. 키는 암호화되어 로컬에 저장됩니다.</p>
            {PROVIDERS.map(p => (
              <ApiKeyRow key={p.id} provider={p.id} label={p.label} placeholder={p.placeholder} />
            ))}
          </div>

          {/* About */}
          <div>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>About</h3>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              <p style={{ margin: '4px 0' }}>Coflux v0.1.0</p>
              <p style={{ margin: '4px 0' }}>P2P AI Bridge System</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
