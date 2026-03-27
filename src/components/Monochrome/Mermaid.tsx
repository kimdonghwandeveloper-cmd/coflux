import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Edit3, Check, Sparkles, AlertCircle } from 'lucide-react';

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'loose',
  fontFamily: 'Inter, system-ui, sans-serif',
});

interface MermaidProps {
  code?: string;
  onCodeChange?: (code: string) => void;
  isDark?: boolean;
}

export const Mermaid = ({ 
  code: initialCode = 'graph TD\n  A[Start] --> B(Concept)\n  B --> C{Strategy}\n  C -->|Fast| D[Execution]\n  C -->|Slow| E[Planning]\n  D --> F((Launch))\n  E --> B', 
  onCodeChange,
  isDark = false
}: MermaidProps) => {
  const [code, setCode] = useState(initialCode);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const renderId = useRef(`mermaid-${Math.random().toString(36).slice(2, 9)}`);

  const renderMermaid = async () => {
    if (!code.trim()) return;
    try {
      // Re-initialize for theme change
      mermaid.initialize({
        theme: isDark ? 'dark' : 'neutral',
        themeVariables: {
          primaryColor: isDark ? '#2e2e2e' : '#f3f4f6',
          primaryTextColor: isDark ? '#ffffff' : '#111827',
          primaryBorderColor: isDark ? '#4b5563' : '#d1d5db',
          lineColor: isDark ? '#9ca3af' : '#4b5563',
          secondaryColor: isDark ? '#1f2937' : '#ffffff',
          tertiaryColor: isDark ? '#111827' : '#f9fafb',
          fontFamily: 'Inter, system-ui, sans-serif',
        }
      });

      const { svg: renderedSvg } = await mermaid.render(renderId.current, code);
      setSvg(renderedSvg);
      setError('');
    } catch (err: any) {
      console.error('Mermaid render error:', err);
      // Mermaid render error handling is tricky as it often throws after rendering error SVG
      setError('Syntax Error: Please check your Mermaid code');
    }
  };

  useEffect(() => {
    // Basic debounce to avoid too many renders while typing
    const timer = setTimeout(renderMermaid, 500);
    return () => clearTimeout(timer);
  }, [code, isDark]);

  return (
    <div className="w-full bg-bg-primary border border-border rounded-2xl overflow-hidden shadow-sm group/mermaid relative transition-all hover:shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-bg-secondary/30 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-accent" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-text-primary opacity-80">System Architecture</span>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setIsEditing(!isEditing)} 
            className={`p-1.5 rounded-lg transition-all flex items-center gap-1.5 ${isEditing ? 'bg-accent text-white' : 'hover:bg-text-primary/10 text-text-secondary'}`}
          >
            {isEditing ? (
              <>
                <Check size={13} strokeWidth={3} />
                <span className="text-[9px] font-bold uppercase tracking-wider">Preview</span>
              </>
            ) : (
              <>
                <Edit3 size={13} />
                <span className="text-[9px] font-bold uppercase tracking-wider">Edit Source</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="relative min-h-[200px] flex items-center justify-center">
        {isEditing ? (
          <div className="w-full p-4 bg-bg-secondary/10">
            <textarea
              className="w-full h-[250px] p-5 font-mono text-[11px] leading-relaxed bg-bg-primary border border-border rounded-xl outline-none focus:border-accent transition-all text-text-primary shadow-inner resize-none select-text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                onCodeChange?.(e.target.value);
              }}
              spellCheck={false}
              autoFocus
            />
            {error && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg animate-in fade-in slide-in-from-top-1 duration-200">
                <AlertCircle size={12} className="text-red-500" />
                <span className="text-[10px] text-red-500 font-bold uppercase tracking-tight">{error}</span>
              </div>
            )}
          </div>
        ) : (
          <div 
            className="p-10 w-full flex items-center justify-center overflow-auto max-h-[600px] mermaid-container select-none" 
            dangerouslySetInnerHTML={{ __html: svg || '<div class="opacity-20 text-[10px] font-bold uppercase tracking-widest animate-pulse">Rendering...</div>' }} 
          />
        )}
      </div>

      {/* Footer Branding */}
      <div className="px-4 py-2 border-t border-border bg-bg-secondary/10 flex justify-end">
        <div className="text-[8px] font-bold text-text-secondary opacity-30 uppercase tracking-[0.3em]">Monochrome Intelligent Engine v2.5</div>
      </div>

      <style>{`
        .mermaid-container svg {
          max-width: 100%;
          height: auto;
          display: block;
          margin: 0 auto;
        }
      `}</style>
    </div>
  );
};
