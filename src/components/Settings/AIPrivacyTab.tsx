import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Key, Check, Trash2, Eye, EyeOff, Layout, Sparkles, Zap } from 'lucide-react';

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { id: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'google', label: 'Google Gemini', placeholder: 'API Key' },
  { id: 'ollama', label: 'Ollama (Local)', placeholder: 'No key required' },
  { id: 'brave_search', label: 'Brave Search', placeholder: 'Brave API Key' },
] as const;

type ProviderId = (typeof PROVIDERS)[number]['id'];

const MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
  google: ['gemini-1.5-pro', 'gemini-1.5-flash'],
  ollama: ['llama3:8b', 'phi3:latest', 'mistral:latest', 'mxbai-embed-large', 'nomic-embed-text'],
  brave_search: [],
};

function ApiKeyRow({ provider, label, placeholder }: { provider: ProviderId; label: string; placeholder: string }) {
  const [registered, setRegistered] = useState(false);
  const [preferredModel, setPreferredModel] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<any>('coflux_get_provider_config', { provider })
      .then(config => {
        setRegistered(config.registered);
        setPreferredModel(config.preferred_model);
      })
      .catch(() => {});
  }, [provider]);

  const save = async () => {
    if (!input.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const defaultModel = MODELS[provider]?.[0] || null;
      await invoke('coflux_register_api_key', { provider, apiKey: input.trim(), preferredModel: defaultModel });
      setRegistered(true);
      setPreferredModel(defaultModel);
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
      setPreferredModel(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const updateModel = async (model: string) => {
    try {
      await invoke('coflux_set_preferred_model', { provider, model });
      setPreferredModel(model);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Key size={13} color="var(--text-secondary)" />
          <span style={{ fontSize: '14px', fontWeight: 500 }}>{label}</span>
        </div>
        {registered && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {MODELS[provider].length > 0 && (
              <select 
                value={preferredModel || ''} 
                onChange={(e) => updateModel(e.target.value)}
                style={{
                  fontSize: '11px',
                  padding: '2px 4px',
                  borderRadius: '4px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  outline: 'none'
                }}
              >
                {MODELS[provider].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Check size={13} color="#22c55e" />
              <span style={{ fontSize: '12px', color: '#22c55e' }}>등록됨</span>
            </div>
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

export function AIPrivacyTab() {
  const [aiProvider, setAiProvider] = useState('openai');
  const [embeddingProvider, setEmbeddingProvider] = useState('openai');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const prov = await invoke<string>('coflux_get_setting', { key: 'ai_provider' });
        setAiProvider(prov);
        const embProv = await invoke<string>('coflux_get_setting', { key: 'embedding_provider' });
        setEmbeddingProvider(embProv);
        const url = await invoke<string>('coflux_get_setting', { key: 'ollama_base_url' });
        setOllamaUrl(url);
      } catch (e) {
        console.warn('Failed to load AI settings:', e);
      }
    };
    loadSettings();
  }, []);

  const saveSetting = async (key: string, value: string) => {
    try {
      await invoke('coflux_set_setting', { key, value });
    } catch (e) {
      console.error(`Failed to save setting ${key}:`, e);
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
      <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>AI & Local Privacy</h3>
      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
        로컬 AI(Ollama) 또는 외부 API를 선택하세요. 모든 데이터는 암호화되어 로컬에 캐싱됩니다.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Sparkles size={14} color="var(--accent)" />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>AI Provider (Chat)</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {['openai', 'anthropic', 'google', 'ollama'].map(p => (
              <button
                key={p}
                onClick={() => { setAiProvider(p); saveSetting('ai_provider', p); }}
                style={{
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid',
                  borderColor: aiProvider === p ? 'var(--accent)' : 'var(--border-color)',
                  background: aiProvider === p ? 'rgba(var(--accent-rgb), 0.1)' : 'var(--bg-secondary)',
                  color: aiProvider === p ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </section>

        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Layout size={14} color="var(--accent)" />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Embedding Provider (Map)</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            {['openai', 'ollama'].map(p => (
              <button
                key={p}
                onClick={() => { setEmbeddingProvider(p); saveSetting('embedding_provider', p); }}
                style={{
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid',
                  borderColor: embeddingProvider === p ? 'var(--accent)' : 'var(--border-color)',
                  background: embeddingProvider === p ? 'rgba(var(--accent-rgb), 0.1)' : 'var(--bg-secondary)',
                  color: embeddingProvider === p ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </section>

        {(aiProvider === 'ollama' || embeddingProvider === 'ollama') && (
          <section style={{ animation: 'slideDownFade 0.3s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Zap size={14} color="var(--accent)" />
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Ollama Base URL</span>
            </div>
            <input
              type="text"
              value={ollamaUrl}
              onChange={e => setOllamaUrl(e.target.value)}
              onBlur={() => saveSetting('ollama_base_url', ollamaUrl)}
              placeholder="http://localhost:11434"
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}
            />
          </section>
        )}

        <div style={{ marginTop: '12px', paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
          <h4 style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>API Keys Management</h4>
          {PROVIDERS.map(p => (
            <ApiKeyRow key={p.id} provider={p.id} label={p.label} placeholder={p.placeholder} />
          ))}
        </div>
      </div>
    </div>
  );
}
