import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Moon, Sun, X, Key, Check, Trash2, Eye, EyeOff, Palette, User, CreditCard, Layout, Zap } from 'lucide-react';
import { WorkspaceData } from '../App';
import { PRESET_THEMES, TOGGLE_THEME_IDS, WorkspaceTheme, ThemeColors } from '../lib/theme';
import { UserProfile, supabase } from '../lib/supabase';

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
  const [activeTab, setActiveTab] = useState<'appearance' | 'workspace' | 'ai_keys' | 'account'>('appearance');
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

  const handleLogin = async () => {
    // Supabase Magic Link 또는 OAuth 호출 (PM님이 설정 완료 후 작동)
    const email = window.prompt('로그인할 이메일을 입력하세요:');
    if (email) {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) alert('로그인 요청 실패: ' + error.message);
      else alert('로그인 링크가 이메일로 전송되었습니다.');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleUpgrade = async () => {
    try {
      if (!user) {
        alert('로그인이 필요한 서비스입니다.');
        setActiveTab('account');
        return;
      }
      
      const url = await invoke<string>('coflux_create_checkout_session', { email: user.email });
      // tauri-plugin-opener가 설치되어 있으므로 open 호출 (또는 브라우저 API 사용)
      window.open(url, '_blank');
    } catch (e) {
      alert('결제 세션 생성 실패: ' + e);
    }
  };

  const handleManageBilling = async () => {
    try {
      if (!user?.stripe_customer_id) {
        alert('빌링 정보가 없습니다. 고객 센터에 문의해주세요.');
        return;
      }
      const url = await invoke<string>('coflux_open_billing_portal', { customerId: user.stripe_customer_id });
      window.open(url, '_blank');
    } catch (e) {
      alert('빌링 포털 오픈 실패: ' + e);
    }
  };

  const TABS = [
    { id: 'appearance', label: 'Appearance', icon: <Palette size={14} /> },
    { id: 'workspace', label: 'Workspace', icon: <Layout size={14} /> },
    { id: 'ai_keys', label: 'AI Keys', icon: <Key size={14} /> },
    { id: 'account', label: 'Account & Plan', icon: <User size={14} /> },
  ] as const;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'slideUpFade 0.15s ease-out forwards' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-primary)', borderRadius: '12px', width: '640px', height: '520px', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Settings</h2>
          <div onClick={onClose} style={{ cursor: 'pointer', padding: '4px', borderRadius: '4px', hover: { background: 'var(--bg-secondary)' } } as any}>
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
              <div>
                <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>Appearance</h3>
                {/* Theme grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
                  {PRESET_THEMES.map(t => {
                    const isActive = t.id === activeThemeId;
                    return (
                      <div
                        key={t.id}
                        onClick={() => { onThemeChange(t.id); setShowCustomEditor(false); }}
                        style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', border: isActive ? '2px solid var(--accent)' : '2px solid var(--border-color)', height: '60px' }}
                      >
                        <div style={{ height: '70%', background: t.colors.bgPrimary, display: 'flex', alignItems: 'flex-end', padding: '4px', gap: '2px' }}>
                          <div style={{ width: '25%', height: '100%', background: t.colors.sidebarBg, borderRadius: '2px' }} />
                          <div style={{ flex: 1, height: '60%', background: t.colors.bgSecondary, borderRadius: '2px' }} />
                        </div>
                        <div style={{ height: '30%', padding: '0 6px', background: t.colors.bgSecondary, display: 'flex', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', fontWeight: 600, color: t.colors.textSecondary }}>{t.name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 커스텀 카드 */}
                <div
                  onClick={() => setShowCustomEditor(v => !v)}
                  style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', border: activeThemeId === 'custom' ? '2px solid var(--accent)' : '2px dashed var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', background: 'var(--bg-secondary)', height: '60px' }}
                >
                  <Palette size={14} color="var(--text-secondary)" />
                  <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-secondary)' }}>커스텀</span>
                </div>

                {/* 커스텀 에디터 */}
                {showCustomEditor && (
                  <div style={{ gridColumn: 'span 4', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '14px', border: '1px solid var(--border-color)', marginTop: '8px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                      {COLOR_FIELDS.map(({ key, label }) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input type="color" value={editColors[key]} onChange={e => handleColorChange(key, e.target.value)} style={{ width: '20px', height: '20px', border: 'none', cursor: 'pointer' }} />
                          <span style={{ fontSize: '11px', flex: 1 }}>{label}</span>
                        </div>
                      ))}
                    </div>
                    <button onClick={applyCustom} style={{ width: '100%', padding: '6px', borderRadius: '4px', background: 'var(--accent)', color: 'white', border: 'none', fontSize: '12px', fontWeight: 600 }}>Apply Custom</button>
                  </div>
                )}

                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                  {TOGGLE_THEME_IDS.includes(activeThemeId) && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px' }}>Quick toggle mode</span>
                      <div onClick={toggleTheme} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 12px', borderRadius: '6px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                        {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
                        <span style={{ fontSize: '12px', fontWeight: 500 }}>{theme === 'light' ? 'Dark' : 'Light'}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'workspace' && activeWorkspace && (
              <div>
                <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>Workspace Settings</h3>
                <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '8px', spaceY: '12px' } as any}>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Workspace Name</label>
                    <input
                      value={activeWorkspace.name}
                      onChange={e => onUpdateWorkspace({ ...activeWorkspace, name: e.target.value, icon: e.target.value.charAt(0).toUpperCase() })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ai_keys' && (
              <div>
                <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>AI API Keys</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Bring Your Own Key: 모든 데이터는 암호화되어 로컬에 저장됩니다.</p>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '8px 16px' }}>
                  {PROVIDERS.map(p => (
                    <ApiKeyRow key={p.id} provider={p.id} label={p.label} placeholder={p.placeholder} />
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>Account & Subscription</h3>
                
                <div style={{ padding: '20px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
                  {user ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '20px', fontWeight: 600 }}>
                        {user.email?.[0].toUpperCase() || 'U'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{user.email}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>ID: {user.id.slice(0, 8)}...</div>
                      </div>
                      <button onClick={handleLogout} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', fontSize: '12px', cursor: 'pointer' }}>Logout</button>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '10px 0' }}>
                      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>로그인하여 기기 간 동기화 및 Pro 기능을 사용하세요.</p>
                      <button 
                        onClick={handleLogin}
                        style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: 'white', fontWeight: 600, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto' }}
                      >
                        <Layout size={16} /> Sign in to CoFlux
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ padding: '20px', background: 'linear-gradient(135deg, var(--bg-surface) 0%, var(--bg-secondary) 100%)', borderRadius: '12px', border: '1px solid var(--border-color)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <CreditCard size={12} /> Current Plan
                        </span>
                        <h4 style={{ margin: '4px 0', fontSize: '20px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {user?.tier === 'pro' ? 'CoFlux Pro' : 'Free Plan'}
                          {user?.tier === 'pro' && <Zap size={18} fill="currentColor" />}
                        </h4>
                      </div>
                      {user?.tier === 'pro' ? (
                        <button 
                          onClick={handleManageBilling}
                          style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                        >
                          Manage
                        </button>
                      ) : (
                        <button 
                          onClick={handleUpgrade}
                          style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--text-primary)', color: 'var(--bg-primary)', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                        >
                          Upgrade
                        </button>
                      )}
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                      {user?.tier === 'pro' 
                        ? '모든 프리미엄 기능을 사용 중입니다. 무제한 AI 질문과 클라우드 동기화가 활성화되어 있습니다.' 
                        : '기본 기능을 무료로 이용 중입니다. Pro로 업그레이드하여 더 강력한 AI와 클라우드 동기화를 경험하세요.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
