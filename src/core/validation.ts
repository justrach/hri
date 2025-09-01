import { object, string, number, boolean, array, optional, record } from 'dhi';
import type { ChatMessage, ChatRequest, ProviderId } from './types';

const ToolCallSchema = object({
  id: string(),
  type: string(),
  function: object({
    name: string(),
    arguments: string(),
  }),
});

const ChatMessageSchema = object({
  role: string(),
  content: string(),
  name: optional(string()),
  tool_call_id: optional(string()),
  tool_calls: optional(array(ToolCallSchema)),
});

export const ChatRequestSchema = object({
  provider: string(),
  model: string(),
  messages: array(ChatMessageSchema),
  temperature: optional(number()),
  max_tokens: optional(number()),
  top_p: optional(number()),
  stream: optional(boolean()),
  json: optional(boolean()),
  extraHeaders: optional(record(string())),
});

export function ensureKnownProvider(id: string): asserts id is ProviderId {
  const known: ProviderId[] = ['openai', 'anthropic', 'groq', 'gemini', 'openrouter', 'sambanova', 'cerebras'];
  if (!known.includes(id as ProviderId)) {
    throw new Error(`Unknown provider: ${id}`);
  }
}

export function validateChatRequest(req: unknown): ChatRequest {
  const result = ChatRequestSchema.safeParse(req as any);
  if (!result.success) {
    const msg = result.error?.toString?.() ?? 'Invalid request';
    throw new Error(msg);
  }
  ensureKnownProvider(result.data.provider);
  const signal = (req as any)?.signal as AbortSignal | undefined;
  // Preserve passthrough fields not in the strict schema (e.g., tools, tool_choice)
  const { tools, tool_choice } = (req as any) || {};
  return { ...(result.data as any), tools, tool_choice, signal } as ChatRequest;
}
