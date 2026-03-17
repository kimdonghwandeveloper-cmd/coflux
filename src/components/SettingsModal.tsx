import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Moon, Sun, X, Key, Check, Trash2, Eye, EyeOff, Palette } from 'lucide-react';
import { WorkspaceData } from '../App';
import { PRESET_THEMES, TOGGLE_THEME_IDS, WorkspaceTheme, ThemeColors } from '../lib/theme';

const COLOR_FIELDS: { key: keyof ThemeColors; label: string }[] = [
  { key: 'bgPrimary',    label: '배경 (기본)' },
  { key: 'bgSecondary',  label: '배경 (보조)' },
  { key: 'bgSurface',    label: '서피스' },
  { key: 'sidebarBg',    label: '사이드바' },
  { key: 'textPrimary',  label: '텍스트' },
  { key: 'textSecondary',label: '텍스트 (보조)' },
  { key: 'borderColor',  label: '보더' },
  { key: 'accent',       label: '강조색' },
  { key: 'accentHover',  label: '강조 호버' },
  { key: 'success',      label: '성공' },
  { key: 'warning',      label: '경고' },
  { key: 'danger',       label: '위험' },
];

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { id: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'brave_search', label: 'Brave Search', placeholder: 'Brave API Key' },
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
  activeThemeId,
  savedCustomTheme,
  onThemeChange,
  activeWorkspace,
  onUpdateWorkspace,
  onClose,
}: {
  theme: string;
  toggleTheme: () => void;
  activeThemeId: string;
  savedCustomTheme?: WorkspaceTheme;
  onThemeChange: (themeId: string, customTheme?: WorkspaceTheme) => void;
  activeWorkspace: WorkspaceData | undefined;
  onUpdateWorkspace: (ws: WorkspaceData) => void;
  onClose: () => void;
}) => {
  const [showCustomEditor, setShowCustomEditor] = useState(activeThemeId === 'custom');
  const baseColors = savedCustomTheme?.colors ?? PRESET_THEMES.find(t => t.id === activeThemeId)?.colors ?? PRESET_THEMES[0].colors;
  const [editColors, setEditColors] = useState<ThemeColors>({ ...baseColors });
  const [isDarkCustom, setIsDarkCustom] = useState(savedCustomTheme?.isDark ?? false);

  const handleColorChange = (key: keyof ThemeColors, value: string) => {
    setEditColors(prev => ({ ...prev, [key]: value }));
  };

  const applyCustom = () => {
    const custom: WorkspaceTheme = { id: 'custom', name: 'Custom', isDark: isDarkCustom, colors: editColors };
    onThemeChange('custom', custom);
  };

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

            {/* Theme grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '12px' }}>
              {PRESET_THEMES.map(t => {
                const isActive = t.id === activeThemeId;
                return (
                  <div
                    key={t.id}
                    onClick={() => { onThemeChange(t.id); setShowCustomEditor(false); }}
                    title={t.name}
                    style={{
                      position: 'relative',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      border: isActive ? '2px solid var(--accent)' : '2px solid var(--border-color)',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    <div style={{ height: '36px', background: t.colors.bgPrimary, display: 'flex', alignItems: 'flex-end', padding: '4px', gap: '2px' }}>
                      <div style={{ width: '28%', height: '100%', background: t.colors.sidebarBg, borderRadius: '3px' }} />
                      <div style={{ flex: 1, height: '60%', background: t.colors.bgSecondary, borderRadius: '3px' }} />
                    </div>
                    <div style={{ padding: '4px 5px', background: t.colors.bgSecondary }}>
                      <span style={{ fontSize: '9px', fontWeight: 600, color: t.colors.textSecondary, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                    </div>
                    {isActive && (
                      <div style={{ position: 'absolute', top: '3px', left: '3px' }}>
                        <Check size={10} color={t.colors.accent} />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* + 커스텀 카드 */}
              <div
                onClick={() => setShowCustomEditor(v => !v)}
                title="커스텀 테마"
                style={{
                  position: 'relative',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  border: activeThemeId === 'custom' ? '2px solid var(--accent)' : '2px dashed var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  minHeight: '58px',
                  background: 'var(--bg-secondary)',
                  transition: 'border-color 0.15s',
                }}
              >
                <Palette size={14} color="var(--text-secondary)" />
                <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-secondary)' }}>커스텀</span>
                {activeThemeId === 'custom' && (
                  <div style={{ position: 'absolute', top: '3px', left: '3px' }}>
                    <Check size={10} color="var(--accent)" />
                  </div>
                )}
              </div>
            </div>

            {/* 커스텀 컬러 에디터 */}
            {showCustomEditor && (
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '14px', marginBottom: '12px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>색상 편집</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={isDarkCustom} onChange={e => setIsDarkCustom(e.target.checked)} style={{ width: '14px', height: '14px' }} />
                    다크 모드
                  </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                  {COLOR_FIELDS.map(({ key, label }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="color"
                        value={editColors[key]}
                        onChange={e => handleColorChange(key, e.target.value)}
                        style={{ width: '28px', height: '28px', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: 0, background: 'none' }}
                      />
                      <span style={{ fontSize: '12px', color: 'var(--text-primary)', flex: 1 }}>{label}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{editColors[key]}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={applyCustom}
                  style={{ width: '100%', padding: '7px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--bg-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  적용
                </button>
              </div>
            )}

            {/* 커스텀 테마일 때: 되돌리기 버튼 / 기본 테마일 때: 토글 버튼 */}
            {TOGGLE_THEME_IDS.includes(activeThemeId) ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ fontSize: '14px' }}>Quick toggle</span>
                <div onClick={toggleTheme} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 12px', borderRadius: '6px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                  {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
                  <span style={{ fontSize: '13px' }}>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>커스텀 테마 적용 중</span>
                <div onClick={() => { onThemeChange('notion-light'); setShowCustomEditor(false); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '5px 12px', borderRadius: '6px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '12px' }}>기본으로 되돌리기</span>
                </div>
              </div>
            )}
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
