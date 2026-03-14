import {
  RTCPeerConnection,
  RTCDataChannel,
  RTCSessionDescription,
  RTCIceCandidate,
  type RTCSessionDescriptionType,
} from 'react-native-webrtc';
import { z } from 'zod';
import {
  IncomingMessageSchema,
  type IncomingMessage,
  type BridgeMessage,
  type Channel,
  type SignalingPayload,
} from '../types/bridge';

// ─── Configuration ───────────────────────────────────────────────────────────

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const CHANNEL_NAMES: Channel[] = [
  'clipboard',
  'control',
  'ai',
  'notification',
  'session',
];

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 1000;

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting';

export interface WebRTCServiceCallbacks {
  onConnectionStateChange: (state: ConnectionState) => void;
  onMessage: (msg: IncomingMessage) => void;
  onError: (error: string) => void;
}

// ─── Service ─────────────────────────────────────────────────────────────────

class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private channels = new Map<Channel, RTCDataChannel>();
  private callbacks: WebRTCServiceCallbacks | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastOfferSdp: string | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  // ─── Public API ─────────────────────────────────────────────────────────

  init(callbacks: WebRTCServiceCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * QR 스캔 결과 또는 수동 입력으로 받은 SDP offer로 연결을 시작합니다.
   * answer SDP를 반환하며, 사용자가 이를 호스트에게 전달해야 합니다.
   */
  async connectFromOffer(signalingPayload: SignalingPayload): Promise<string> {
    this.lastOfferSdp = signalingPayload.sdp;
    this.setState('connecting');
    this.cleanup(false);

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.attachPeerConnectionHandlers();

    // 호스트가 열 DataChannel들을 수신 대기
    this.pc.ondatachannel = (event) => {
      this.registerChannel(event.channel as RTCDataChannel);
    };

    await this.pc.setRemoteDescription(
      new RTCSessionDescription({
        type: signalingPayload.type as RTCSessionDescriptionType,
        sdp: signalingPayload.sdp,
      }),
    );

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    // ICE gathering 완료 대기
    await this.waitForIceGathering();

    return JSON.stringify(this.pc.localDescription);
  }

  send(channel: Channel, msg: Omit<BridgeMessage, 'timestamp' | 'messageId'>): void {
    const dc = this.channels.get(channel);
    if (!dc || dc.readyState !== 'open') {
      // 해당 채널이 없으면 control 채널로 폴백 (호스트가 단일 채널만 지원하는 경우)
      const fallback = this.channels.get('control') ?? [...this.channels.values()][0];
      if (!fallback || fallback.readyState !== 'open') {
        this.callbacks?.onError(`채널 '${channel}' 미사용 가능 상태`);
        return;
      }
      this.sendRaw(fallback, msg);
      return;
    }
    this.sendRaw(dc, msg);
  }

  disconnect(): void {
    this.clearReconnectTimer();
    this.clearPingInterval();
    this.cleanup(true);
    this.setState('idle');
    this.reconnectAttempts = 0;
    this.lastOfferSdp = null;
  }

  // ─── Private: Connection Lifecycle ──────────────────────────────────────

  private attachPeerConnectionHandlers(): void {
    if (!this.pc) return;

    this.pc.onicecandidate = (event) => {
      // react-native-webrtc에서 null은 gathering 완료를 의미
      if (event.candidate) {
        // Trickle ICE: M1에서는 waitForIceGathering()으로 일괄 처리
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      if (state === 'connected') {
        this.reconnectAttempts = 0;
        this.setState('connected');
        this.startPingInterval();
      } else if (state === 'disconnected' || state === 'failed') {
        this.clearPingInterval();
        this.scheduleReconnect();
      } else if (state === 'closed') {
        this.clearPingInterval();
      }
    };

    this.pc.onicegatheringstatechange = () => {
      // waitForIceGathering() 폴링에 사용됨
    };
  }

  private registerChannel(dc: RTCDataChannel): void {
    const name = dc.label as Channel;
    if (!CHANNEL_NAMES.includes(name)) {
      // 알 수 없는 채널은 default로 처리 (기존 단일채널 호스트 호환)
      this.channels.set('control', dc);
    } else {
      this.channels.set(name, dc);
    }

    dc.onmessage = (event) => this.handleRawMessage(String(event.data));
    dc.onopen = () => {
      // 모든 채널이 열리면 connected
      if ([...this.channels.values()].some(c => c.readyState === 'open')) {
        this.setState('connected');
      }
    };
    dc.onclose = () => {
      this.channels.delete(name);
    };
  }

  private handleRawMessage(raw: string): void {
    // 500KB 제한 (호스트 보안 정책과 동일)
    if (raw.length > 500 * 1024) {
      this.callbacks?.onError('수신 메시지 크기 초과 (500KB)');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.callbacks?.onError('메시지 JSON 파싱 실패');
      return;
    }

    const result = IncomingMessageSchema.safeParse(parsed);
    if (!result.success) {
      this.callbacks?.onError(
        `알 수 없는 메시지 타입: ${(parsed as Record<string, unknown>)?.type ?? 'unknown'}`,
      );
      return;
    }

    // pong은 내부 처리, 나머지는 콜백
    if (result.data.type === 'pong') return;

    this.callbacks?.onMessage(result.data);
  }

  private sendRaw(dc: RTCDataChannel, msg: Omit<BridgeMessage, 'timestamp' | 'messageId'>): void {
    const full: BridgeMessage = {
      ...msg,
      timestamp: Date.now(),
      messageId: crypto.randomUUID(),
    } as BridgeMessage;
    dc.send(JSON.stringify(full));
  }

  // ─── Private: Reconnection ────────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (!this.lastOfferSdp || this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.setState('disconnected');
      return;
    }
    this.setState('reconnecting');
    const delay = BASE_BACKOFF_MS * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(async () => {
      if (!this.lastOfferSdp) return;
      try {
        await this.connectFromOffer({ sdp: this.lastOfferSdp, type: 'offer', version: 1 });
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ─── Private: Keep-alive ─────────────────────────────────────────────────

  private startPingInterval(): void {
    this.clearPingInterval();
    this.pingInterval = setInterval(() => {
      const dc = this.channels.get('control');
      if (dc?.readyState === 'open') {
        this.sendRaw(dc, { type: 'ping', channel: 'control', payload: {} });
      }
    }, 30_000);
  }

  private clearPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // ─── Private: ICE ────────────────────────────────────────────────────────

  private waitForIceGathering(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.pc || this.pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      const check = setInterval(() => {
        if (!this.pc || this.pc.iceGatheringState === 'complete') {
          clearInterval(check);
          resolve();
        }
      }, 100);
      // 최대 10초 대기
      setTimeout(() => { clearInterval(check); resolve(); }, 10_000);
    });
  }

  // ─── Private: Cleanup ────────────────────────────────────────────────────

  private cleanup(closePc: boolean): void {
    this.channels.forEach(dc => dc.close());
    this.channels.clear();
    if (closePc && this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }

  private setState(state: ConnectionState): void {
    this.callbacks?.onConnectionStateChange(state);
  }
}

export const webRTCService = new WebRTCService();
