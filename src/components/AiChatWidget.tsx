import { useState, useEffect } from 'react';
import { Send, Database, Layout, Globe, Search, Sparkles } from 'lucide-react';
import { webrtcClient } from '../lib/webrtc_client';
import { sharedChat, getEncodedYjsUpdateString, applyIncomingYjsUpdate } from '../lib/crdt_store';
import { routeAiTask } from '../lib/ai_router';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { ragQuery, PageScope, RagSource } from '../lib/rag';

interface Message {
  sender: string;
  text: string;
  type: string;
  sources?: RagSource[];
}

export const AiChatWidget = ({ 
  connState, 
  pageTitle, 
  pageId, 
  workspaceId 
}: { 
  connState: string;
  pageTitle?: string;
  pageId?: string;
  workspaceId?: string;
}) => {
  const [messages, setMessages] = useState<Message[]>(sharedChat.toArray());
  const [input, setInput] = useState('');
  const [ragScope, setRagScope] = useState<PageScope | 'off'>('off');
  const [isQuerying, setIsQuerying] = useState(false);
  
  // 1. Bind Yjs CRDT instance to React State
  useEffect(() => {
    const observer = () => setMessages(sharedChat.toArray());
    sharedChat.observe(observer);
    return () => sharedChat.unobserve(observer);
  }, []);

  // 2. Listen to incoming P2P updates representing peer actions
  useEffect(() => {
    let unlisten: UnlistenFn;
    const setup = async () => {
      unlisten = await listen<string>('webrtc-msg', (event) => {
        const text = event.payload;
        if (text.startsWith('yjs_')) {
           applyIncomingYjsUpdate(text.replace('yjs_', ''));
        }
      });
    };
    setup();
    return () => { if (unlisten) unlisten(); };
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isQuerying) return;
    
    setIsQuerying(true);
    const userQuery = input;
    setInput('');

    // Step A: Push to local CRDT immediately
    sharedChat.push([{ sender: 'Me', text: userQuery, type: 'user' }]);
    
    // Step B: Atomic Handover Broadcast
    if (connState === 'Connected!') {
       webrtcClient.sendMessage('yjs_' + getEncodedYjsUpdateString()).catch(console.error);
    }

    try {
      let aiRespText = '';
      let routedTo = '';
      let sources: RagSource[] | undefined = undefined;

      if (ragScope !== 'off') {
        // RAG Query
        const resp = await ragQuery(userQuery, ragScope, workspaceId, pageId);
        aiRespText = resp.answer;
        routedTo = 'RAG Assistant';
        sources = resp.sources;
      } else {
        // Standard AI Router
        const contextPrefix = pageTitle ? `[Context: User is editing page "${pageTitle}"] ` : '';
        const aiResp = await routeAiTask({ type: 'ai_request', prompt: contextPrefix + userQuery, externalAllowed: true });
        aiRespText = aiResp.text;
        routedTo = aiResp.routed_to;
      }
      
      // Step D: Write AI Response to CRDT and Broadcast
      sharedChat.push([{ 
        sender: routedTo, 
        text: aiRespText, 
        type: 'ai',
        sources: sources
      }]);
      
      if (connState === 'Connected!') {
         webrtcClient.sendMessage('yjs_' + getEncodedYjsUpdateString()).catch(console.error);
      }
    } catch (e) {
      console.error(e);
      sharedChat.push([{ sender: 'System', text: `Error: ${e}`, type: 'ai' }]);
    } finally {
      setIsQuerying(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '12px', boxSizing: 'border-box' }}>
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: '12px', padding: '8px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
        {messages.map((m: Message, i: number) => (
          <div key={i} style={{ marginBottom: '12px', textAlign: m.sender === 'Me' ? 'right' : 'left' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>{m.sender}</span><br />
            <div style={{ 
               display: 'inline-block', 
               padding: '10px 14px', 
               borderRadius: '16px',
               backgroundColor: m.type === 'ai' ? 'var(--accent)' : 'var(--bg-color)',
               border: m.type === 'ai' ? 'none' : '1px solid var(--border-color)',
               color: m.type === 'ai' ? 'white' : 'var(--text-color)',
               maxWidth: '90%',
               textAlign: 'left',
               fontSize: '14px',
               lineHeight: '1.5',
               boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}>
              {m.text}
              {m.sources && m.sources.length > 0 && (
                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.2)', fontSize: '11px' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Sources:</div>
                  {m.sources.map((s: RagSource, idx: number) => (
                    <div key={idx} style={{ opacity: 0.9, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Search size={10} /> {s.title}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: '60px' }}>
            <Sparkles size={32} color="var(--accent)" style={{ opacity: 0.5, marginBottom: '12px' }} />
            <p style={{ fontSize:'13px', color:'var(--text-secondary)' }}>
              How can I help you with your workspace today?
            </p>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', padding: '4px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
        {[
          { id: 'off', icon: <Search size={14} />, label: 'Chat' },
          { id: 'current', icon: <Layout size={14} />, label: 'Page' },
          { id: 'workspace', icon: <Database size={14} />, label: 'WS' },
          { id: 'all', icon: <Globe size={14} />, label: 'All' },
        ].map(s => (
          <button
            key={s.id}
            onClick={() => setRagScope(s.id as any)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '6px',
              fontSize: '11px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: ragScope === s.id ? 'var(--accent)' : 'transparent',
              color: ragScope === s.id ? 'white' : 'var(--text-secondary)',
              transition: 'all 0.2s ease',
            }}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <input 
          style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-color)', fontSize: '14px' }}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={ragScope === 'off' ? "Ask AI..." : `Search in ${ragScope}...`}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          disabled={isQuerying}
        />
        <button 
          className="notion-btn primary" 
          onClick={handleSend} 
          disabled={isQuerying || !input.trim()}
          style={{ borderRadius: '8px', padding: '0 16px' }}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
};
