import { invoke } from '@tauri-apps/api/core';

// ─── 타입 정의 ────────────────────────────────────────────────────────────────

export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgSurface: string;
  sidebarBg: string;
  textPrimary: string;
  textSecondary: string;
  borderColor: string;
  accent: string;
  accentHover: string;
  success: string;
  warning: string;
  danger: string;
  brandColor1: string;
  brandColor2: string;
}

export interface WorkspaceTheme {
  id: string;
  name: string;
  isDark: boolean;
  colors: ThemeColors;
}

// ─── 프리셋 테마 (Free: 처음 5개, Pro: 전체) ─────────────────────────────────

export const PRESET_THEMES: WorkspaceTheme[] = [
  {
    id: 'notion-light',
    name: 'Notion Light',
    isDark: false,
    colors: {
      bgPrimary: '#ffffff', bgSecondary: '#f7f7f5', bgSurface: '#ffffff',
      sidebarBg: '#f7f7f5', textPrimary: '#37352f', textSecondary: '#787774',
      borderColor: '#e9e9e7', accent: '#2e2e2e', accentHover: '#1f1f1f',
      success: '#22c55e', warning: '#f59e0b', danger: '#e03e3e',
      brandColor1: '#2e2e2e', brandColor2: '#2e2e2e',
    },
  },
  {
    id: 'notion-dark',
    name: 'Notion Dark',
    isDark: true,
    colors: {
      bgPrimary: '#191919', bgSecondary: '#202020', bgSurface: '#191919',
      sidebarBg: '#202020', textPrimary: '#ffffff', textSecondary: '#9b9a97',
      borderColor: '#2f2f2f', accent: '#ffffff', accentHover: '#e0e0e0',
      success: '#22c55e', warning: '#f59e0b', danger: '#eb5757',
      brandColor1: '#ffffff', brandColor2: '#ffffff',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    isDark: true,
    colors: {
      bgPrimary: '#0f1923', bgSecondary: '#162030', bgSurface: '#0f1923',
      sidebarBg: '#0b1520', textPrimary: '#cdd6f4', textSecondary: '#7aa2f7',
      borderColor: '#1e3a5f', accent: '#7aa2f7', accentHover: '#5a8fd8',
      success: '#9ece6a', warning: '#e0af68', danger: '#f7768e',
      brandColor1: '#7aa2f7', brandColor2: '#7aa2f7',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    isDark: true,
    colors: {
      bgPrimary: '#1a2318', bgSecondary: '#212d1f', bgSurface: '#1a2318',
      sidebarBg: '#161e15', textPrimary: '#d8e8d0', textSecondary: '#87a878',
      borderColor: '#2d4028', accent: '#87a878', accentHover: '#6b8f5e',
      success: '#a3be8c', warning: '#ebcb8b', danger: '#bf616a',
      brandColor1: '#87a878', brandColor2: '#87a878',
    },
  },
  {
    id: 'pastel',
    name: 'Pastel',
    isDark: false,
    colors: {
      bgPrimary: '#fdf6ff', bgSecondary: '#f3eaff', bgSurface: '#ffffff',
      sidebarBg: '#eedcff', textPrimary: '#3b2d4a', textSecondary: '#8b6fa8',
      borderColor: '#ddc8f5', accent: '#9b59b6', accentHover: '#7d3c98',
      success: '#58d68d', warning: '#f39c12', danger: '#e74c3c',
      brandColor1: '#9b59b6', brandColor2: '#9b59b6',
    },
  },
  // ─── Pro 전용 ──────────────────────────────────────────────────────────────
  {
    id: 'dracula',
    name: 'Dracula',
    isDark: true,
    colors: {
      bgPrimary: '#282a36', bgSecondary: '#1e2029', bgSurface: '#282a36',
      sidebarBg: '#21222c', textPrimary: '#f8f8f2', textSecondary: '#6272a4',
      borderColor: '#44475a', accent: '#bd93f9', accentHover: '#a170f0',
      success: '#50fa7b', warning: '#f1fa8c', danger: '#ff5555',
      brandColor1: '#bd93f9', brandColor2: '#bd93f9',
    },
  },
  {
    id: 'monokai',
    name: 'Monokai',
    isDark: true,
    colors: {
      bgPrimary: '#272822', bgSecondary: '#1e1f1a', bgSurface: '#272822',
      sidebarBg: '#1e1f1a', textPrimary: '#f8f8f2', textSecondary: '#75715e',
      borderColor: '#3e3d32', accent: '#a6e22e', accentHover: '#8ec920',
      success: '#a6e22e', warning: '#e6db74', danger: '#f92672',
      brandColor1: '#a6e22e', brandColor2: '#a6e22e',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    isDark: true,
    colors: {
      bgPrimary: '#2e3440', bgSecondary: '#272c36', bgSurface: '#2e3440',
      sidebarBg: '#252a33', textPrimary: '#eceff4', textSecondary: '#7b88a1',
      borderColor: '#3b4252', accent: '#88c0d0', accentHover: '#6aacbc',
      success: '#a3be8c', warning: '#ebcb8b', danger: '#bf616a',
      brandColor1: '#88c0d0', brandColor2: '#88c0d0',
    },
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    isDark: true,
    colors: {
      bgPrimary: '#191724', bgSecondary: '#1f1d2e', bgSurface: '#191724',
      sidebarBg: '#1a1825', textPrimary: '#e0def4', textSecondary: '#908caa',
      borderColor: '#2a2740', accent: '#c4a7e7', accentHover: '#a87dd7',
      success: '#31748f', warning: '#f6c177', danger: '#eb6f92',
      brandColor1: '#c4a7e7', brandColor2: '#c4a7e7',
    },
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    isDark: true,
    colors: {
      bgPrimary: '#1a1b26', bgSecondary: '#16161e', bgSurface: '#1a1b26',
      sidebarBg: '#13131a', textPrimary: '#c0caf5', textSecondary: '#565f89',
      borderColor: '#292e42', accent: '#7aa2f7', accentHover: '#5a82d7',
      success: '#9ece6a', warning: '#e0af68', danger: '#f7768e',
      brandColor1: '#7aa2f7', brandColor2: '#7aa2f7',
    },
  },
];

// 모든 테마 무료. TOGGLE_THEME_IDS: 다크/라이트 토글이 의미있는 테마 (기본 두 가지)
export const FREE_THEME_IDS = PRESET_THEMES.map(t => t.id);
export const TOGGLE_THEME_IDS = ['notion-light', 'notion-dark'];

// ─── 유틸리티 ─────────────────────────────────────────────────────────────────

/** E27: 배경색의 명도(Luma)를 계산하여 대비되는 텍스트 색상(검/흰)을 반환 */
export function getContrastColor(hexColor: string): string {
  if (!hexColor) return '#37352f';
  let hex = hexColor.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // W3C Luma 공식
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  
  // 밝기가 140 이상이면 밝은 배경이므로 어두운 글씨(Black), 아니면 흰 글씨(White)
  return luma > 140 ? '#1a1a1a' : '#ffffff';
}

// ─── CSS 변수 적용 ────────────────────────────────────────────────────────────

export function applyTheme(theme: WorkspaceTheme) {
  const root = document.documentElement;
  const c = theme.colors;

  root.style.setProperty('--bg-primary', c.bgPrimary);
  root.style.setProperty('--bg-secondary', c.bgSecondary);
  root.style.setProperty('--bg-surface', c.bgSurface);
  root.style.setProperty('--sidebar-bg', c.sidebarBg);
  root.style.setProperty('--text-primary', c.textPrimary);
  root.style.setProperty('--text-secondary', c.textSecondary);
  root.style.setProperty('--border-color', c.borderColor);
  root.style.setProperty('--accent', c.accent);
  root.style.setProperty('--accent-hover', c.accentHover);
  root.style.setProperty('--success', c.success);
  root.style.setProperty('--warning', c.warning);
  root.style.setProperty('--danger', c.danger);
  root.style.setProperty('--brand-1', c.brandColor1);
  root.style.setProperty('--brand-2', c.brandColor2);

  // BlockNote / data-theme 호환
  root.setAttribute('data-theme', theme.isDark ? 'dark' : 'light');
}

// ─── DB 저장/불러오기 ─────────────────────────────────────────────────────────

export async function saveTheme(workspaceId: string, themeId: string, customTheme?: WorkspaceTheme): Promise<void> {
  await invoke('save_workspace_theme', {
    workspaceId,
    themeId,
    customThemeJson: customTheme ? JSON.stringify(customTheme) : null,
  });
}

export async function loadTheme(workspaceId: string): Promise<{ themeId: string; customTheme?: WorkspaceTheme }> {
  const result = await invoke<{ theme_id: string; custom_theme_json: string | null }>('get_workspace_theme', { workspaceId });
  return {
    themeId: result.theme_id,
    customTheme: result.custom_theme_json ? JSON.parse(result.custom_theme_json) : undefined,
  };
}

export function resolveTheme(themeId: string, customTheme?: WorkspaceTheme): WorkspaceTheme {
  if (themeId === 'custom' && customTheme) return customTheme;
  return PRESET_THEMES.find(t => t.id === themeId) ?? PRESET_THEMES[0];
}
