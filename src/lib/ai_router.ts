import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { z } from 'zod';

// ─── ModelStatus 스키마 ──────────────────────────────────────────────────────
export const ModelStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('NotLoaded') }),
  z.object({ state: z.literal('Downloading'), progress_pct: z.number().int().min(0).max(100) }),
  z.object({ state: z.literal('Loading') }),
  z.object({ state: z.literal('Ready') }),
  z.object({ state: z.literal('Failed'), message: z.string() }),
]);
export type ModelStatus = z.infer<typeof ModelStatusSchema>;

// ─── InferenceRequest 스키마 ─────────────────────────────────────────────────
const ScanTypeSchema = z.enum(['Code', 'Text', 'Binary']);

const ChatMessageSchema = z.object({
  role: z.string(),
  content: z.string(),
});

export const InferenceRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('SecurityScan'),
    payload: z.string().min(1).max(500 * 1024),
    scan_type: ScanTypeSchema,
  }),
  z.object({
    type: z.literal('Summarize'),
    text: z.string().min(1),
    max_length: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('Classify'),
    text: z.string().min(1),
    categories: z.array(z.string()).min(1),
  }),
  z.object({
    type: z.literal('FreeChat'),
    messages: z.array(ChatMessageSchema).min(1),
  }),
]);
export type InferenceRequest = z.infer<typeof InferenceRequestSchema>;

// ─── InferenceResponse 스키마 ────────────────────────────────────────────────
export const InferenceResponseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('SecurityResult'),
    risk_score: z.number(),
    allowed: z.boolean(),
    assessment: z.string(),
    explanation: z.string(),
    processing_time_ms: z.number(),
  }),
  z.object({
    type: z.literal('SummaryResult'),
    summary: z.string(),
    processing_time_ms: z.number(),
  }),
  z.object({
    type: z.literal('ClassifyResult'),
    category: z.string(),
    tags: z.array(z.string()),
    processing_time_ms: z.number(),
  }),
  z.object({
    type: z.literal('ChatResult'),
    response: z.string(),
    processing_time_ms: z.number(),
  }),
  z.object({
    type: z.literal('Error'),
    message: z.string(),
  }),
]);
export type InferenceResponse = z.infer<typeof InferenceResponseSchema>;

// ─── IPC 래퍼 ────────────────────────────────────────────────────────────────

/** coflux_infer Tauri IPC 호출 */
export async function invokeCofluxInfer(request: InferenceRequest): Promise<InferenceResponse> {
  const validated = InferenceRequestSchema.parse(request);
  const raw = await invoke<unknown>('coflux_infer', { request: validated });
  return InferenceResponseSchema.parse(raw);
}

/** coflux_model_status Tauri IPC 호출 */
export async function getModelStatus(): Promise<ModelStatus> {
  const raw = await invoke<unknown>('coflux_model_status');
  return ModelStatusSchema.parse(raw);
}

/** coflux-model-status Tauri 이벤트 리스너 등록 */
export async function onModelStatusChange(
  callback: (status: ModelStatus) => void
): Promise<UnlistenFn> {
  return listen<unknown>('coflux-model-status', (event) => {
    const result = ModelStatusSchema.safeParse(event.payload);
    if (result.success) {
      callback(result.data);
    }
  });
}

/** 모델 상태 폴링 시작 (intervalMs 기본 10초).
 *  반환된 stop 함수 호출 시 폴링 중단. */
export function startModelStatusPolling(
  callback: (status: ModelStatus) => void,
  intervalMs = 10_000
): () => void {
  let running = true;
  const tick = async () => {
    if (!running) return;
    try {
      const status = await getModelStatus();
      callback(status);
    } catch {
      // Tauri 환경 아닌 경우(웹 dev) 무시
    }
    if (running) setTimeout(tick, intervalMs);
  };
  tick();
  return () => {
    running = false;
  };
}

// ─── 스트리밍 타입 ───────────────────────────────────────────────────────────

export interface StreamTokenEvent { request_id: string; token: string }
export interface StreamDoneEvent  { request_id: string; processing_time_ms: number }
export interface StreamErrorEvent { request_id: string; message: string }

/**
 * 워크플로우 태스크용 스트리밍 추론.
 * 백엔드가 ai_stream_token / ai_stream_done / ai_stream_error 이벤트로 결과를 전달.
 *
 * @param requestId  클라이언트가 생성하는 고유 ID (이벤트 매칭용)
 * @param request    FreeChat 요청 (generate_page 등 워크플로우 태스크)
 */
export async function invokeCofluxInferStream(
  requestId: string,
  request: InferenceRequest
): Promise<void> {
  const validated = InferenceRequestSchema.parse(request);
  await invoke<void>('coflux_infer_stream', {
    requestId,
    request: validated,
  });
}

// ─── 리소스 통계 스키마 ──────────────────────────────────────────────────────

export const ResourceStatsSchema = z.object({
  cpu_pct: z.number(),
  used_memory_mb: z.number(),
  model_state: z.string(),
  last_inference_ms: z.number().nullable(),
});
export type ResourceStats = z.infer<typeof ResourceStatsSchema>;

/** coflux-resource-stats 이벤트 리스너 등록 */
export async function onResourceStats(
  callback: (stats: ResourceStats) => void
): Promise<UnlistenFn> {
  return listen<unknown>('coflux-resource-stats', (event) => {
    const result = ResourceStatsSchema.safeParse(event.payload);
    if (result.success) callback(result.data);
  });
}

// ─── C4: 라우팅 분배 로직 ────────────────────────────────────────────────────

const LOCAL_TASKS = ['security_scan', 'summarize_short', 'classify', 'risk_assessment'] as const;
const EXTERNAL_TASKS = [
  'generate_page',
  'complex_reasoning',
  'long_document',
  'code_generation',
] as const;

export type LocalTaskType = (typeof LOCAL_TASKS)[number];
export type ExternalTaskType = (typeof EXTERNAL_TASKS)[number];
export type TaskType = LocalTaskType | ExternalTaskType;

type RouteDecision = 'local' | 'external';

/**
 * 태스크 타입과 API 키 유무를 기반으로 라우팅 결정.
 * - LOCAL_TASKS → 항상 local
 * - EXTERNAL_TASKS + hasApiKey → external
 * - EXTERNAL_TASKS + !hasApiKey → local fallback
 *
 * TODO(C5): BYOK 기본 제공자 확정 후 외부 API 호출 경로 구현
 *           (OpenAI / Anthropic / 둘 다 — PM 미확정)
 */
export function decideRoute(task: TaskType, hasApiKey: boolean): RouteDecision {
  if ((EXTERNAL_TASKS as readonly string[]).includes(task)) {
    if (hasApiKey) {
      console.info(`[CoFlux Router] ${task} → external_api`);
      return 'external';
    }
    console.info(`[CoFlux Router] ${task} → local (no API key, fallback)`);
    return 'local';
  }
  console.info(`[CoFlux Router] ${task} → local`);
  return 'local';
}

// ─── 레거시 호환 인터페이스 ──────────────────────────────────────────────────

export const AiPayloadSchema = z.object({
  type: z.literal('ai_request'),
  prompt: z.string().min(1).max(5000),
  externalAllowed: z.boolean().default(false),
});
export type AiPayload = z.infer<typeof AiPayloadSchema>;

export const AiResponseSchema = z.object({
  type: z.literal('ai_response'),
  text: z.string(),
  routed_to: z.enum(['local_sllM', 'external_api']),
});
export type AiResponse = z.infer<typeof AiResponseSchema>;

/** 범용 AI 라우터. FreeChat 요청을 coflux_infer IPC로 위임. */
export const routeAiTask = async (payload: AiPayload): Promise<AiResponse> => {
  const validData = AiPayloadSchema.parse(payload);

  let modelReady = false;
  try {
    const status = await getModelStatus();
    modelReady = status.state === 'Ready';
  } catch {
    // 비-Tauri 환경(웹 dev) fallback
  }

  if (modelReady) {
    const result = await invokeCofluxInfer({
      type: 'FreeChat',
      messages: [{ role: 'user', content: validData.prompt }],
    });
    const text =
      result.type === 'ChatResult'
        ? result.response
        : result.type === 'Error'
          ? `[Error] ${result.message}`
          : JSON.stringify(result);
    return { type: 'ai_response', text, routed_to: 'local_sllM' };
  }

  // 모델 미준비 fallback
  return {
    type: 'ai_response',
    text: `[Local sLLM - Model not ready] ${validData.prompt}`,
    routed_to: 'local_sllM',
  };
};
