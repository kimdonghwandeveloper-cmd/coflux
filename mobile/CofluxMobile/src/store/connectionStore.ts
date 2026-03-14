import { create } from 'zustand';
import type { ConnectionState } from '../services/WebRTCService';
import type { IncomingMessage, NotificationMessage, ApprovalRequest } from '../types/bridge';

interface HostInfo {
  name: string;
  sessionId: string;
  connectedPeers: string[];
}

interface ConnectionStore {
  // ─── 연결 상태 ────────────────────────────────
  connectionState: ConnectionState;
  hostInfo: HostInfo | null;
  lastError: string | null;

  // ─── 알림/승인 큐 ──────────────────────────────
  notifications: NotificationMessage[];
  pendingApprovals: ApprovalRequest[];

  // ─── 클립보드 ──────────────────────────────────
  lastReceivedClipboard: string | null;

  // ─── 액션 ─────────────────────────────────────
  setConnectionState: (state: ConnectionState) => void;
  setHostInfo: (info: HostInfo | null) => void;
  setError: (error: string | null) => void;
  handleIncomingMessage: (msg: IncomingMessage) => void;
  clearError: () => void;
  dismissApproval: (requestId: string) => void;
  clearNotification: (messageId: string) => void;
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  connectionState: 'idle',
  hostInfo: null,
  lastError: null,
  notifications: [],
  pendingApprovals: [],
  lastReceivedClipboard: null,

  setConnectionState: (state) => set({ connectionState: state }),

  setHostInfo: (info) => set({ hostInfo: info }),

  setError: (error) => set({ lastError: error }),

  clearError: () => set({ lastError: null }),

  dismissApproval: (requestId) =>
    set((s) => ({
      pendingApprovals: s.pendingApprovals.filter(
        (a) => a.payload.requestId !== requestId,
      ),
    })),

  clearNotification: (messageId) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.messageId !== messageId),
    })),

  handleIncomingMessage: (msg) => {
    switch (msg.type) {
      case 'clipboard_receive':
        set({ lastReceivedClipboard: msg.payload.content });
        break;

      case 'notification':
        set((s) => ({
          notifications: [msg as NotificationMessage, ...s.notifications].slice(0, 50),
        }));
        break;

      case 'approval_request':
        set((s) => ({
          pendingApprovals: [msg as ApprovalRequest, ...s.pendingApprovals],
        }));
        break;

      case 'session_info':
        set({
          hostInfo: {
            name: msg.payload.hostName,
            sessionId: msg.payload.sessionId,
            connectedPeers: msg.payload.connectedPeers,
          },
        });
        break;

      default:
        break;
    }
  },
}));
