import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Moon, Sun, X, Key, Check, Trash2, Eye, EyeOff, Palette, User, CreditCard, Layout, Zap, Github, Sparkles } from 'lucide-react';
import { WorkspaceData } from '../App';
import { PRESET_THEMES, TOGGLE_THEME_IDS, WorkspaceTheme, ThemeColors } from '../lib/theme';
import { UserProfile, supabase } from '../lib/supabase';

// ─── 색상 처리 유틸리티 ───────────────────────────────────────────────────────

/** Hex (#RRGGBB) -> HSL ({h, s, l}) 변환 */
function hexToHsl(hex: string) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;

  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

/** HSL ({h, s, l}) -> Hex (#RRGGBB) 변환 */
function hslToHex(h: number, s: number, l: number) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    let p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ─── AI Providers 정의 ────────────────────────────────────────────────────────
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

const FeatureItem = ({ text, active }: { text: string; active: boolean }) => (
  <li style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
    {active ? (
      <Check size={12} style={{ color: 'var(--accent)' }} />
    ) : (
      <X size={12} style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
    )}
    <span style={{ fontSize: '11px', color: active ? 'var(--text-primary)' : 'var(--text-secondary)', opacity: active ? 1 : 0.6 }}>
      {text}
    </span>
  </li>
);

const ThemeBubble = ({ color, size, active, label, top, left, onClick, onMouseDown, isDragging }: { color: string; size: number; active: boolean; label: string; top: string; left: string; onClick: () => void; onMouseDown: (e: React.MouseEvent) => void, isDragging?: boolean }) => (
  <div 
    onClick={onClick}
    onMouseDown={onMouseDown}
    style={{ 
      position: 'absolute', 
      top, 
      left, 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      gap: '8px', 
      zIndex: 2, 
      cursor: isDragging ? 'grabbing' : 'grab', 
      transition: isDragging ? 'none' : 'all 0.2s cubic-bezier(0.23, 1, 0.32, 1)' 
    }}
  >
    <div style={{ 
      width: size + 'px', 
      height: size + 'px', 
      borderRadius: '50%', 
      background: color, 
      border: active ? '3px solid white' : '1px solid var(--border-color)',
      boxShadow: active ? '0 0 20px ' + color : '0 4px 12px rgba(0,0,0,0.1)',
      transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      transform: active ? 'scale(1.1)' : 'scale(1)'
    }}></div>
    <span style={{ fontSize: '10px', fontWeight: 600, color: active ? 'var(--text-primary)' : 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
  </div>
);

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
  const baseColors = savedCustomTheme?.colors ?? PRESET_THEMES.find(t => t.id === activeThemeId)?.colors ?? PRESET_THEMES[0].colors;
  const [editColors, setEditColors] = useState<ThemeColors>({ ...baseColors });
  const [isDarkCustom, setIsDarkCustom] = useState(savedCustomTheme?.isDark ?? false);
  const [selectedField, setSelectedField] = useState<keyof ThemeColors>('accent');
  const [draggingField, setDraggingField] = useState<keyof ThemeColors | null>(null);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const [isDraggingKnob, setIsDraggingKnob] = useState(false);

  // 시각적 좌표 상태 (H, L 매핑용 - 무채색 시 Hue 보존 및 조절 바 조작 시 위치 고정용)
  const [visualPositions, setVisualPositions] = useState<{ [key in keyof ThemeColors]: { x: number, y: number } }>(() => {
    const init: any = {};
    (['bgPrimary', 'accent', 'textPrimary'] as const).forEach(k => {
      const hsl = hexToHsl(baseColors[k]);
      // Y축 클램핑: 명도가 범위를 벗어나도 0-100% 내에 머물게 함
      const y = Math.max(0, Math.min(100, (80 - hsl.l) / 50 * 100));
      init[k] = { x: (hsl.h / 360) * 100, y };
    });
    return init;
  });

  // HSL 조절 헬퍼
  const updateHsl = (key: keyof ThemeColors, { h, s, l }: { h?: number; s?: number; l?: number }) => {
    // visualPositions에 저장된 '시각적 Hue'를 우선 참조 (무채색 시 Hue 소실 방지)
    const visualH = visualPositions[key as keyof typeof visualPositions]?.x ? (visualPositions[key as keyof typeof visualPositions].x * 3.6) : hexToHsl(editColors[key]).h;
    const currentHsl = hexToHsl(editColors[key]);
    
    const nextHex = hslToHex(
      h ?? visualH,
      s ?? currentHsl.s,
      l ?? currentHsl.l
    );
    handleColorChange(key, nextHex);
  };

  // 전역 마우스 이벤트 핸들러
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (draggingField) {
        const editor = document.getElementById('visual-theme-editor');
        if (!editor) return;
        const rect = editor.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        
        // X -> Hue (0-360)
        // Y -> Lightness (위로 갈수록 밝아짐: 80 - 30 범위 매핑)
        const l = 80 - (y * 50); 
        const h = x * 360;
        
        setVisualPositions(prev => ({ ...prev, [draggingField]: { x: x * 100, y: y * 100 } }));
        updateHsl(draggingField, { h, l });
      } else if (isDraggingSlider) {
        const slider = document.getElementById('saturation-slider');
        if (!slider) return;
        const rect = slider.getBoundingClientRect();
        const s = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        updateHsl(selectedField, { s });
      } else if (isDraggingKnob) {
        const knob = document.getElementById('brightness-knob');
        if (!knob) return;
        const rect = knob.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const rawAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
        
        // 12시 방향을 0도로 설정
        let angle = rawAngle + 90;
        if (angle > 180) angle -= 360;
        if (angle < -180) angle += 360;

        // 회전 범위를 -135도 ~ 135도 (총 270도)로 제한
        const clampedAngle = Math.max(-135, Math.min(135, angle));
        
        // -135(Min) -> 30%, 135(Max) -> 80% 밝기로 매핑 (중심 55%)
        const l = 55 + (clampedAngle / 135) * 25;
        updateHsl(selectedField, { l });
      }
    };

    const handleGlobalMouseUp = () => {
      setDraggingField(null);
      setIsDraggingSlider(false);
      setIsDraggingKnob(false);
    };

    if (draggingField || isDraggingSlider || isDraggingKnob) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [draggingField, isDraggingSlider, isDraggingKnob, selectedField, editColors]);

  const handleDragStart = (e: React.MouseEvent, key: keyof ThemeColors) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedField(key);
    setDraggingField(key);
  };

  const handleColorChange = (key: keyof ThemeColors, value: string, syncVisual = false) => {
    const newColors = { ...editColors, [key]: value };
    setEditColors(newColors);
    
    if (syncVisual) {
      const hsl = hexToHsl(value);
      // 명도 기반 Y축 클램핑 (30-80% 범위를 넘어가는 흰색/검정 대응)
      const y = Math.max(0, Math.min(100, (80 - hsl.l) / 50 * 100));
      setVisualPositions(prev => ({
        ...prev,
        [key]: { x: (hsl.h / 360) * 100, y }
      }));
    }

    if (savedCustomTheme) {
      onThemeChange('custom', { ...savedCustomTheme, colors: newColors, isDark: isDarkCustom });
    } else {
      onThemeChange('custom', { id: 'custom', name: 'Custom Theme', colors: newColors, isDark: isDarkCustom });
    }
  };

  const handleModeChange = (isDark: boolean) => {
    setIsDarkCustom(isDark);
    const custom: WorkspaceTheme = { 
      id: 'custom', 
      name: 'Custom', 
      isDark, 
      colors: editColors 
    };
    onThemeChange('custom', custom);
  };

  const handleSocialLogin = async (provider: 'google' | 'github') => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin, // 데스크톱 환경 리다이렉트
        }
      });
      if (error) throw error;
    } catch (e) {
      alert(`${provider} 로그인 실패: ` + e);
    }
  };

  const handleMagicLinkLogin = async () => {
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
                        onClick={() => onThemeChange(t.id)}
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
                  {/* 커스텀 카드 */}
                  <div
                    onClick={() => onThemeChange('custom')}
                    style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', border: activeThemeId === 'custom' ? '2px solid var(--accent)' : '2px dashed var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', background: 'var(--bg-secondary)', height: '60px' }}
                  >
                    <Palette size={14} color="var(--text-secondary)" />
                    <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-secondary)' }}>커스텀</span>
                  </div>
                </div>

                {/* 비주얼 테마 에디터 (이미지 기반) */}
                <div 
                  id="visual-theme-editor"
                  style={{ 
                    marginTop: '12px', 
                    background: 'var(--bg-secondary)', 
                    borderRadius: '16px', 
                    padding: '24px', 
                    border: '1px solid var(--border-color)',
                    position: 'relative',
                    overflow: 'hidden',
                    minHeight: '520px',
                    display: 'flex',
                    flexDirection: 'column',
                    userSelect: 'none'
                  }}
                >
                  {/* 도트 그리드 배경 */}
                  <div style={{ 
                    position: 'absolute', 
                    inset: 0, 
                    backgroundImage: 'radial-gradient(var(--border-color) 1px, transparent 1px)', 
                    backgroundSize: '25px 25px', 
                    opacity: 0.1,
                    pointerEvents: 'none'
                  }}></div>

                  {/* 상단 모드 선택기 */}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '40px', position: 'relative', zIndex: 1 }}>
                    <div onClick={() => handleModeChange(false)} style={{ cursor: 'pointer', padding: '10px', borderRadius: '12px', background: !isDarkCustom ? 'var(--bg-primary)' : 'transparent', border: !isDarkCustom ? '1px solid var(--border-color)' : 'none', color: !isDarkCustom ? 'var(--accent)' : 'var(--text-secondary)', transition: 'all 0.2s' }}>
                      <Sparkles size={20} />
                    </div>
                    <div onClick={() => handleModeChange(false)} style={{ cursor: 'pointer', padding: '10px', borderRadius: '12px', background: !isDarkCustom ? 'var(--bg-primary)' : 'transparent', border: 'none', color: 'var(--text-secondary)' }}>
                      <Sun size={20} />
                    </div>
                    <div onClick={() => handleModeChange(true)} style={{ cursor: 'pointer', padding: '10px', borderRadius: '12px', background: isDarkCustom ? 'var(--bg-primary)' : 'transparent', border: isDarkCustom ? '1px solid var(--border-color)' : 'none', color: isDarkCustom ? 'var(--accent)' : 'var(--text-secondary)', transition: 'all 0.2s' }}>
                      <Moon size={20} />
                    </div>
                  </div>

                  {/* 중앙 인터랙티브 버블 (주요 색상 선택) */}
                  <div style={{ flex: 1, position: 'relative', marginBottom: '40px' }}>
                    <ThemeBubble 
                      color={editColors.bgPrimary} 
                      size={54} 
                      isDragging={draggingField === 'bgPrimary'}
                      active={selectedField === 'bgPrimary'} 
                      label="Background" 
                      top={`${visualPositions.bgPrimary.y}%`} 
                      left={`calc(${visualPositions.bgPrimary.x}% - 27px)`} 
                      onClick={() => setSelectedField('bgPrimary')} 
                      onMouseDown={(e) => handleDragStart(e, 'bgPrimary')}
                    />
                    <ThemeBubble 
                      color={editColors.accent} 
                      size={36} 
                      isDragging={draggingField === 'accent'}
                      active={selectedField === 'accent'} 
                      label="Accent" 
                      top={`${visualPositions.accent.y}%`} 
                      left={`calc(${visualPositions.accent.x}% - 18px)`} 
                      onClick={() => setSelectedField('accent')} 
                      onMouseDown={(e) => handleDragStart(e, 'accent')}
                    />
                    <ThemeBubble 
                      color={editColors.textPrimary} 
                      size={24} 
                      isDragging={draggingField === 'textPrimary'}
                      active={selectedField === 'textPrimary'} 
                      label="Text" 
                      top={`${visualPositions.textPrimary.y}%`} 
                      left={`calc(${visualPositions.textPrimary.x}% - 12px)`} 
                      onClick={() => setSelectedField('textPrimary')} 
                      onMouseDown={(e) => handleDragStart(e, 'textPrimary')}
                    />
                  </div>

                  {/* 하단 컬러 팔레트 & 슬라이더 영역 */}
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}>
                      {[
                        '#FFFFFF', '#000000', '#FFF9F0', '#F9E1E8', '#EBD4FB', '#DF8C96', '#E29774', '#D4CE82', '#6BE4A7', '#94A1C1',
                        '#FF9AA2', '#FFB7B2', '#FFDAC1', '#E2F0CB', '#B5EAD7', '#C7CEEA', '#97C1A9', '#55CBCD',
                        '#ABC4FF', '#EDF2FB', '#7400B8', '#6930C3', '#48BFE3'
                      ].map(c => (
                        <div 
                           key={c} 
                           onClick={() => handleColorChange(selectedField, c, true)} 
                           style={{ 
                            width: '24px', 
                            height: '24px', 
                            borderRadius: '50%', 
                            background: c, 
                            cursor: 'pointer', 
                            border: '2px solid transparent', 
                            transform: editColors[selectedField] === c ? 'scale(1.2)' : 'none', 
                            boxShadow: editColors[selectedField] === c ? '0 0 0 2px var(--bg-primary), 0 0 0 4px ' + c : 'none',
                            transition: 'all 0.2s'
                          }}
                        ></div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {/* 채도 슬라이더 (웨이브) */}
                      <div 
                        id="saturation-slider"
                        onMouseDown={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const s = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                          updateHsl(selectedField, { s });
                          setIsDraggingSlider(true);
                        }}
                        style={{ flex: 1, position: 'relative', height: '12px', background: 'var(--bg-primary)', borderRadius: '6px', border: '1px solid var(--border-color)', cursor: 'pointer' }}
                      >
                        <div style={{ 
                          position: 'absolute', 
                          top: '50%', 
                          left: `${hexToHsl(editColors[selectedField]).s}%`, 
                          width: '18px', 
                          height: '34px', 
                          background: 'white', 
                          borderRadius: '4px', 
                          transform: 'translate(-50%, -50%)', 
                          boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                          transition: isDraggingSlider ? 'none' : 'left 0.2s',
                          zIndex: 2
                        }}></div>
                        <svg width="100%" height="100%" viewBox="0 0 200 12" preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, opacity: 0.2 }}>
                          <path d="M0,6 Q25,0 50,6 T100,6 T150,6 T200,6" fill="none" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      </div>

                      {/* 밝기 노브 (로터리 다이얼 - Gas Stove Style) */}
                      <div 
                        id="brightness-knob"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setIsDraggingKnob(true);
                        }}
                        style={{ width: '60px', height: '60px', borderRadius: '50%', border: '4px dashed var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', transition: 'transform 0.2s' }}
                      >
                         {/* 12시 방향 고정 기준점 */}
                         <div style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', width: '4px', height: '4px', borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }}></div>
                         
                         <div style={{ 
                           width: '40px', 
                           height: '40px', 
                           borderRadius: '50%', 
                           background: editColors[selectedField], 
                           border: '2px solid white', 
                           boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                           position: 'relative',
                           transform: `rotate(${(hexToHsl(editColors[selectedField]).l - 55) / 25 * 135}deg)`
                         }}>
                           {/* 노브 포인트 (가스레인지 다이얼 표시 - 기준점과 정렬됨) */}
                           <div style={{ position: 'absolute', top: '4px', left: '50%', transform: 'translateX(-50%)', width: '6px', height: '6px', borderRadius: '50%', background: 'white', opacity: 0.9 }}></div>
                         </div>
                      </div>
                    </div>
                  </div>
                </div>

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
                      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>로그인하여 기기 간 동기화 및 Pro 기능을 사용하세요.</p>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '280px', margin: '0 auto' }}>
                        <button 
                          onClick={() => handleSocialLogin('google')}
                          style={{ width: '100%', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'white', color: '#333', fontWeight: 600, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/><path d="M1 1h22v22H1z" fill="none"/></svg>
                          Continue with Google
                        </button>
                        
                        <button 
                          onClick={() => handleSocialLogin('github')}
                          style={{ width: '100%', padding: '10px 16px', borderRadius: '8px', border: 'none', background: '#24292e', color: 'white', fontWeight: 600, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
                        >
                          <Github size={18} /> Continue with GitHub
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0' }}>
                          <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>or</span>
                          <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
                        </div>

                        <button 
                          onClick={handleMagicLinkLogin}
                          style={{ width: '100%', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontWeight: 500, fontSize: '13px', cursor: 'pointer' }}
                        >
                          Email Magic Link
                        </button>
                      </div>
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

                {/* 플랜 비교 리스트 */}
                <div style={{ marginTop: '24px' }}>
                  <h4 style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', paddingLeft: '4px' }}>Plan Comparison</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {/* Free Plan Features */}
                    <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-primary)' }}>Free</div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, spaceY: '8px' } as any}>
                        <FeatureItem text="기본 AI 모델 이용" active />
                        <FeatureItem text="로컬 데이터 저장" active />
                        <FeatureItem text="클라우드 동기화" active={false} />
                        <FeatureItem text="무제한 AI 질문" active={false} />
                      </ul>
                    </div>

                    {/* Pro Plan Features */}
                    <div style={{ padding: '16px', background: 'rgba(var(--accent-rgb), 0.05)', borderRadius: '12px', border: '1px solid var(--accent)', position: 'relative' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Pro <Zap size={12} fill="currentColor" />
                      </div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, spaceY: '8px' } as any}>
                        <FeatureItem text="최신 고급 AI 모델" active />
                        <FeatureItem text="실시간 클라우드 동기화" active />
                        <FeatureItem text="무제한 AI 질문 & 컨텍스트" active />
                        <FeatureItem text="우선 순위 지원" active />
                      </ul>
                    </div>
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
