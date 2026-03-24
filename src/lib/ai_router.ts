import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

// ─── BYOK API 키 관리 ────────────────────────────────────────────────────────

export type Provider = 'openai' | 'anthropic' | 'google' | 'ollama';

export async function registerApiKey(provider: Provider, apiKey: string): Promise<void> {
  await invoke('coflux_register_api_key', { provider, apiKey });
}

export async function hasApiKey(provider: Provider): Promise<boolean> {
  if (provider === 'ollama') return true; // Ollama doesn't need a key
  return invoke<boolean>('coflux_has_api_key', { provider });
}

export async function deleteApiKey(provider: Provider): Promise<void> {
  await invoke('coflux_delete_api_key', { provider });
}

/** 외부 AI API 호출. API 키는 Rust 레이어에서만 처리됨. */
export async function externalApiCall(
  provider: Provider,
  prompt: string,
  history?: Array<{ role: string; content: string }>
): Promise<string> {
  return invoke<string>('coflux_external_api_call', { provider, prompt, history: history ?? null });
}

// ─── C4: 라우팅 분배 로직 ────────────────────────────────────────────────────

const LOCAL_TASKS  = ['security_scan', 'summarize_short', 'classify', 'risk_assessment'] as const;
const EXTERNAL_TASKS = ['generate_page', 'complex_reasoning', 'long_document', 'code_generation'] as const;

export type LocalTaskType    = (typeof LOCAL_TASKS)[number];
export type ExternalTaskType = (typeof EXTERNAL_TASKS)[number];
export type TaskType         = LocalTaskType | ExternalTaskType;

type RouteDecision = 'local_rules' | 'external';

/**
 * 태스크 타입과 API 키 유무를 기반으로 라우팅 결정.
 * - LOCAL_TASKS  → 룰베이스 처리 (local_rules)
 * - EXTERNAL_TASKS + hasApiKey → external
 * - EXTERNAL_TASKS + !hasApiKey → 에러
 */
export function decideRoute(task: TaskType, hasApiKey: boolean): RouteDecision {
  if ((EXTERNAL_TASKS as readonly string[]).includes(task)) {
    if (hasApiKey) {
      console.info(`[CoFlux Router] ${task} → external_api`);
      return 'external';
    }
    console.warn(`[CoFlux Router] ${task} → no API key registered`);
    return 'external'; // 호출 시 에러 발생 — 상위에서 처리
  }
  console.info(`[CoFlux Router] ${task} → local_rules`);
  return 'local_rules';
}

// ─── 범용 AI 라우터 ──────────────────────────────────────────────────────────

export const AiPayloadSchema = z.object({
  type: z.literal('ai_request'),
  prompt: z.string().min(1).max(5000),
  externalAllowed: z.boolean().default(false),
  history: z.array(z.object({ role: z.string(), content: z.string() })).optional(),
});
export type AiPayload = z.infer<typeof AiPayloadSchema>;

export const AiResponseSchema = z.object({
  type: z.literal('ai_response'),
  text: z.string(),
  routed_to: z.enum(['local_rules', 'external_api', 'error']),
});
export type AiResponse = z.infer<typeof AiResponseSchema>;

/** 범용 AI 라우터. externalAllowed + API 키 있으면 외부 API 호출, 없으면 에러 반환. */
export const routeAiTask = async (payload: AiPayload): Promise<AiResponse> => {
  const validData = AiPayloadSchema.parse(payload);

  if (validData.externalAllowed) {
    // ai_provider 설정을 먼저 확인하거나, 우선순위대로 시도
    let preferredProvider: Provider | null = null;
    try {
      preferredProvider = await invoke<Provider>('coflux_get_setting', { key: 'ai_provider' });
    } catch (e) {
      console.warn('ai_provider 설정을 가져오지 못했습니다. 기본 순서대로 진행합니다.');
    }

    const providers: Provider[] = preferredProvider 
      ? [preferredProvider, 'openai', 'anthropic', 'google', 'ollama'].filter((v, i, a) => a.indexOf(v) === i) as Provider[]
      : ['openai', 'anthropic', 'google', 'ollama'];

    for (const provider of providers) {
      if (await hasApiKey(provider)) {
        try {
          const text = await externalApiCall(provider, validData.prompt, validData.history);
          return { type: 'ai_response', text, routed_to: 'external_api' };
        } catch (e) {
          console.error(`[CoFlux Router] ${provider} 호출 실패:`, e);
        }
      }
    }
    return {
      type: 'ai_response',
      text: 'API 키가 없거나 호출에 실패했습니다. Settings에서 API 키를 등록하세요.',
      routed_to: 'error',
    };
  }

  // externalAllowed = false → 룰베이스 응답 (보안 스캔 등 단순 태스크)
  return {
    type: 'ai_response',
    text: `[Rules] Processed: "${validData.prompt}"`,
    routed_to: 'local_rules',
  };
};
