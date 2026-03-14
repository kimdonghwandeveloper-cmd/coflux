import { z } from 'zod';

// ─── Base ───────────────────────────────────────────────────────────────────

export const ChannelSchema = z.enum([
  'clipboard',
  'control',
  'ai',
  'notification',
  'session',
]);
export type Channel = z.infer<typeof ChannelSchema>;

export const BridgeMessageSchema = z.object({
  type: z.string(),
  channel: ChannelSchema,
  payload: z.unknown(),
  timestamp: z.number(),
  messageId: z.string(),
});
export type BridgeMessage = z.infer<typeof BridgeMessageSchema>;

// ─── Clipboard Channel ───────────────────────────────────────────────────────

export const ClipboardContentTypeSchema = z.enum(['text', 'url', 'image']);

export const ClipboardSendSchema = BridgeMessageSchema.extend({
  type: z.literal('clipboard_send'),
  channel: z.literal('clipboard'),
  payload: z.object({
    content: z.string(),
    contentType: ClipboardContentTypeSchema,
  }),
});
export type ClipboardSend = z.infer<typeof ClipboardSendSchema>;

export const ClipboardReceiveSchema = BridgeMessageSchema.extend({
  type: z.literal('clipboard_receive'),
  channel: z.literal('clipboard'),
  payload: z.object({
    content: z.string(),
    contentType: ClipboardContentTypeSchema,
    from: z.string(),
  }),
});
export type ClipboardReceive = z.infer<typeof ClipboardReceiveSchema>;

// ─── AI Channel ─────────────────────────────────────────────────────────────

export const AiTaskSchema = z.enum(['summarize', 'classify', 'scan']);

export const AiRequestSchema = BridgeMessageSchema.extend({
  type: z.literal('ai_request'),
  channel: z.literal('ai'),
  payload: z.object({
    task: AiTaskSchema,
    input: z.string(),
  }),
});
export type AiRequest = z.infer<typeof AiRequestSchema>;

export const AiResponseSchema = BridgeMessageSchema.extend({
  type: z.literal('ai_response'),
  channel: z.literal('ai'),
  payload: z.object({
    task: AiTaskSchema,
    result: z.string(),
    processingTime: z.number(),
  }),
});
export type AiResponse = z.infer<typeof AiResponseSchema>;

// ─── Notification Channel ────────────────────────────────────────────────────

export const SeveritySchema = z.enum(['info', 'warning', 'critical']);

export const NotificationMessageSchema = BridgeMessageSchema.extend({
  type: z.literal('notification'),
  channel: z.literal('notification'),
  payload: z.object({
    title: z.string(),
    body: z.string(),
    severity: SeveritySchema,
    actionRequired: z.boolean(),
  }),
});
export type NotificationMessage = z.infer<typeof NotificationMessageSchema>;

// ─── Control Channel ────────────────────────────────────────────────────────

export const ApprovalRequestSchema = BridgeMessageSchema.extend({
  type: z.literal('approval_request'),
  channel: z.literal('control'),
  payload: z.object({
    requestId: z.string(),
    action: z.string(),
    description: z.string(),
  }),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const ApprovalResponseSchema = BridgeMessageSchema.extend({
  type: z.literal('approval_response'),
  channel: z.literal('control'),
  payload: z.object({
    requestId: z.string(),
    approved: z.boolean(),
  }),
});
export type ApprovalResponse = z.infer<typeof ApprovalResponseSchema>;

// ─── Session Channel ─────────────────────────────────────────────────────────

export const SessionInfoSchema = BridgeMessageSchema.extend({
  type: z.literal('session_info'),
  channel: z.literal('session'),
  payload: z.object({
    hostName: z.string(),
    connectedPeers: z.array(z.string()),
    sessionId: z.string(),
  }),
});
export type SessionInfo = z.infer<typeof SessionInfoSchema>;

// ─── Ping/Pong (keep-alive) ─────────────────────────────────────────────────

export const PingSchema = BridgeMessageSchema.extend({
  type: z.literal('ping'),
  channel: z.literal('control'),
  payload: z.object({}),
});

export const PongSchema = BridgeMessageSchema.extend({
  type: z.literal('pong'),
  channel: z.literal('control'),
  payload: z.object({}),
});

// ─── Union discriminator ─────────────────────────────────────────────────────

export const IncomingMessageSchema = z.discriminatedUnion('type', [
  ClipboardReceiveSchema,
  AiResponseSchema,
  NotificationMessageSchema,
  ApprovalRequestSchema,
  SessionInfoSchema,
  PongSchema,
]);
export type IncomingMessage = z.infer<typeof IncomingMessageSchema>;

// ─── Signaling ───────────────────────────────────────────────────────────────

/** QR 코드에 인코딩되는 시그널링 페이로드 */
export const SignalingPayloadSchema = z.object({
  sdp: z.string(),
  type: z.enum(['offer', 'answer']),
  version: z.literal(1),
});
export type SignalingPayload = z.infer<typeof SignalingPayloadSchema>;
