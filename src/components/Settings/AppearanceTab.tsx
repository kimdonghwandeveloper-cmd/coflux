import { useEffect, useState } from 'react';
import { Moon, Sun, Sparkles, Palette } from 'lucide-react';
import { PRESET_THEMES, TOGGLE_THEME_IDS, WorkspaceTheme, ThemeColors } from '../../lib/theme';
import { hexToHsl, hslToHex } from '../../lib/colorUtils';

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

export function AppearanceTab({
  theme,
  toggleTheme,
  activeThemeId,
  savedCustomTheme,
  onThemeChange,
}: {
  theme: string;
  toggleTheme: () => void;
  activeThemeId: string;
  savedCustomTheme?: WorkspaceTheme;
  onThemeChange: (themeId: string, customTheme?: WorkspaceTheme) => void;
}) {
  const baseColors = savedCustomTheme?.colors ?? PRESET_THEMES.find(t => t.id === activeThemeId)?.colors ?? PRESET_THEMES[0].colors;
  const [editColors, setEditColors] = useState<ThemeColors>({ ...baseColors });
  const [isDarkCustom, setIsDarkCustom] = useState(savedCustomTheme?.isDark ?? false);
  const [selectedField, setSelectedField] = useState<keyof ThemeColors>('accent');
  const [draggingField, setDraggingField] = useState<keyof ThemeColors | null>(null);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const [isDraggingKnob, setIsDraggingKnob] = useState(false);
  
  const [visualPositions, setVisualPositions] = useState<{ [key in keyof ThemeColors]: { x: number, y: number } }>(() => {
    const init: any = {};
    (['bgPrimary', 'bgSecondary', 'accent', 'textPrimary', 'brandColor1', 'brandColor2'] as const).forEach(k => {
      const color = baseColors[k] || '#ffffff';
      const hsl = hexToHsl(color);
      const y = Math.max(0, Math.min(100, (80 - hsl.l) / 50 * 100));
      init[k] = { x: (hsl.h / 360) * 100, y };
    });
    return init;
  });

  const updateHsl = (key: keyof ThemeColors, { h, s, l }: { h?: number; s?: number; l?: number }) => {
    const visualH = visualPositions[key as keyof typeof visualPositions]?.x ? (visualPositions[key as keyof typeof visualPositions].x * 3.6) : hexToHsl(editColors[key]).h;
    const currentHsl = hexToHsl(editColors[key]);
    
    const nextHex = hslToHex(
      h ?? visualH,
      s ?? currentHsl.s,
      l ?? currentHsl.l
    );
    handleColorChange(key, nextHex);
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (draggingField) {
        const editor = document.getElementById('visual-theme-editor');
        if (!editor) return;
        const rect = editor.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        
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
        
        let angle = rawAngle + 90;
        if (angle > 180) angle -= 360;
        if (angle < -180) angle += 360;

        const clampedAngle = Math.max(-135, Math.min(135, angle));
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
    
    if (key === 'bgPrimary') {
      newColors.bgSurface = value;
    }
    if (key === 'bgSecondary') {
      newColors.sidebarBg = value;
    }
    
    setEditColors(newColors);
    
    if (syncVisual) {
      const hsl = hexToHsl(value);
      const y = Math.max(0, Math.min(100, (80 - hsl.l) / 50 * 100));
      
      setVisualPositions(prev => {
        const newX = hsl.s === 0 ? prev[key].x : (hsl.h / 360) * 100;
        return {
          ...prev,
          [key]: { x: newX, y }
        };
      });
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

  return (
    <div>
      <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>Appearance</h3>
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
        <div
          onClick={() => onThemeChange('custom')}
          style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', border: activeThemeId === 'custom' ? '2px solid var(--accent)' : '2px dashed var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', background: 'var(--bg-secondary)', height: '60px' }}
        >
          <Palette size={14} color="var(--text-secondary)" />
          <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-secondary)' }}>커스텀</span>
        </div>
      </div>

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
            color={editColors.bgSecondary} 
            size={44} 
            isDragging={draggingField === 'bgSecondary'}
            active={selectedField === 'bgSecondary'} 
            label="Sidebar" 
            top={`${visualPositions.bgSecondary?.y || 50}%`} 
            left={`calc(${visualPositions.bgSecondary?.x || 50}% - 22px)`} 
            onClick={() => setSelectedField('bgSecondary')} 
            onMouseDown={(e) => handleDragStart(e, 'bgSecondary')}
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
          <ThemeBubble 
            color={editColors.brandColor1 || '#ffffff'} 
            size={40} 
            isDragging={draggingField === 'brandColor1'}
            active={selectedField === 'brandColor1'} 
            label="Brand 1" 
            top={`${visualPositions.brandColor1?.y || 20}%`} 
            left={`calc(${visualPositions.brandColor1?.x || 20}% - 20px)`} 
            onClick={() => setSelectedField('brandColor1')} 
            onMouseDown={(e) => handleDragStart(e, 'brandColor1')}
          />
          <ThemeBubble 
            color={editColors.brandColor2 || '#ffffff'} 
            size={40} 
            isDragging={draggingField === 'brandColor2'}
            active={selectedField === 'brandColor2'} 
            label="Brand 2" 
            top={`${visualPositions.brandColor2?.y || 20}%`} 
            left={`calc(${visualPositions.brandColor2?.x || 80}% - 20px)`} 
            onClick={() => setSelectedField('brandColor2')} 
            onMouseDown={(e) => handleDragStart(e, 'brandColor2')}
          />
        </div>

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
            <div 
              id="saturation-slider"
              onMouseDown={(e) => {
                if (hexToHsl(editColors[selectedField]).s === 0) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const s = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                updateHsl(selectedField, { s });
                setIsDraggingSlider(true);
              }}
              style={{ flex: 1, position: 'relative', height: '12px', background: 'var(--bg-primary)', borderRadius: '6px', border: '1px solid var(--border-color)', cursor: hexToHsl(editColors[selectedField]).s === 0 ? 'default' : 'pointer', opacity: hexToHsl(editColors[selectedField]).s === 0 ? 0.4 : 1, transition: 'all 0.3s ease' }}
            >
              <div style={{ position: 'absolute', top: '50%', left: `${hexToHsl(editColors[selectedField]).s}%`, width: '18px', height: '34px', background: 'white', borderRadius: '4px', transform: 'translate(-50%, -50%)', boxShadow: '0 2px 10px rgba(0,0,0,0.3)', pointerEvents: 'none' }}></div>
            </div>

            <div 
              id="brightness-knob"
              onMouseDown={(e) => {
                e.preventDefault();
                setIsDraggingKnob(true);
              }}
              style={{ width: '60px', height: '60px', borderRadius: '50%', border: '4px dashed var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', transition: 'transform 0.2s' }}
            >
               <div style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', width: '4px', height: '4px', borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }}></div>
               <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: editColors[selectedField], border: '2px solid white', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', position: 'relative', transform: `rotate(${(hexToHsl(editColors[selectedField]).l - 55) / 25 * 135}deg)` }}>
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
  );
}
