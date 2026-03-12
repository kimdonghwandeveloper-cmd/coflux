import { useState, useEffect } from 'react';
import { Send } from 'lucide-react';
import { webrtcClient } from '../lib/webrtc_client';
import { sharedChat, getEncodedYjsUpdateString, applyIncomingYjsUpdate } from '../lib/crdt_store';
import { routeAiTask } from '../lib/ai_router';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export const AiChatWidget = ({ connState }: { connState: string }) => {
  const [messages, setMessages] = useState(sharedChat.toArray());
  const [input, setInput] = useState('');
  
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
    if (!input.trim()) return;
    
    // Step A: Push to local CRDT immediately
    sharedChat.push([{ sender: 'Me', text: input, type: 'user' }]);
    
    // Step B: Atomic Handover Broadcast
    if (connState === 'Connected!') {
       webrtcClient.sendMessage('yjs_' + getEncodedYjsUpdateString()).catch(console.error);
    }

    // Step C: Prompt AI Router and wait for local/external response
    const aiResp = await routeAiTask({ type: 'ai_request', prompt: input, externalAllowed: true });
    
    // Step D: Write AI Response to CRDT and Broadcast
    sharedChat.push([{ sender: aiResp.routed_to, text: aiResp.text, type: 'ai' }]);
    if (connState === 'Connected!') {
       webrtcClient.sendMessage('yjs_' + getEncodedYjsUpdateString()).catch(console.error);
    }
    
    setInput('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingBottom: '12px' }}>
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: '8px', padding: '8px', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: '8px', textAlign: m.sender === 'Me' ? 'right' : 'left' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{m.sender}</span><br />
            <div style={{ 
               display: 'inline-block', 
               padding: '6px 10px', 
               borderRadius: '12px',
               backgroundColor: m.type === 'ai' ? 'var(--accent)' : 'var(--bg-color)',
               color: m.type === 'ai' ? 'white' : 'var(--text-color)',
               maxWidth: '85%',
               textAlign: 'left',
               fontSize: '13px'
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <p style={{ fontSize:'12px', color:'var(--text-secondary)', textAlign: 'center', marginTop: '40px'}}>
            No messages yet. CRDT Atomic Handover is ready.
          </p>
        )}
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input 
          style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-color)' }}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask AI Router..."
          onKeyDown={e => e.key === 'Enter' && handleSend()}
        />
        <button className="notion-btn primary" onClick={handleSend}><Send size={16} /></button>
      </div>
    </div>
  );
};
