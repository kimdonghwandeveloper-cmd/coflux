import { z } from 'zod';

export const AiPayloadSchema = z.object({
  type: z.literal('ai_request'),
  prompt: z.string().min(1).max(5000),
  externalAllowed: z.boolean().default(false)
});

export type AiPayload = z.infer<typeof AiPayloadSchema>;

export const AiResponseSchema = z.object({
  type: z.literal('ai_response'),
  text: z.string(),
  routed_to: z.enum(['local_sllM', 'external_api'])
});

export type AiResponse = z.infer<typeof AiResponseSchema>;

export const routeAiTask = async (payload: AiPayload): Promise<AiResponse> => {
  // 1. Zod runtime validation (Edge Security boundary on frontend)
  const validData = AiPayloadSchema.parse(payload);
  
  // 2. Intelligent Routing Logic (Rule-based for Phase 3 prototype)
  const isComplex = validData.prompt.length > 30 || validData.prompt.toLowerCase().includes('explain');
  
  if (isComplex && validData.externalAllowed) {
    // [Phase 3 API Proxy path]
    return {
      type: 'ai_response',
      text: `[External Proxy] Processed complex query: "${validData.prompt}"`,
      routed_to: 'external_api'
    };
  } else {
    // [Phase 3 Local Zero-cost path]
    return {
      type: 'ai_response',
      text: `[Local sLLM] Processed safely: "${validData.prompt}"`,
      routed_to: 'local_sllM'
    };
  }
};
