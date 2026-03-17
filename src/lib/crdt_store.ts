import * as Y from 'yjs';
import { invoke } from '@tauri-apps/api/core';

// Represents the shared Atomic Handover document
export const ydoc = new Y.Doc();
// A shared array of chat strings
export const sharedChat = ydoc.getArray<{sender: string, text: string, type: string, sources?: any[]}>('chat_logs');

// Listen to local changes and sync to SQLite via Tauri IPC
ydoc.on('update', async (updateArray) => {
  try {
    // Convert Uint8Array to standard JS Array for IPC serialization
    const updateBlob = Array.from(updateArray);
    // [ZERO-COST Persistence] Save to SQLite via Rust bridging
    await invoke('save_yjs_update', { updateBlob });
  } catch (e) {
    console.error("Failed to persist Yjs update to SQLite:", e);
  }
});

// Used to apply incoming CRDT blob from WebRTC DataChannel
export const applyIncomingYjsUpdate = (updateStr: string) => {
  try {
    const array = JSON.parse(updateStr);
    Y.applyUpdate(ydoc, new Uint8Array(array));
  } catch (e) {
    console.error("Yjs merge conflict or invalid JSON:", e);
  }
};

// Used to encode local state to share with peers
export const getEncodedYjsUpdateString = (): string => {
  const update = Y.encodeStateAsUpdate(ydoc);
  return JSON.stringify(Array.from(update));
};
