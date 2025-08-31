export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatRequest {
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  json?: boolean; // request JSON-structured output if provider supports
  extraHeaders?: Record<string, string>;
  signal?: AbortSignal;
}

export interface ChatResponseChoice {
  index: number;
  message: ChatMessage;
  finish_reason: string | null;
}

export interface ChatResponse {
  id: string;
  created: number;
  model: string;
  choices: ChatResponseChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  provider: ProviderId;
  raw?: unknown;
}

export interface ChatStreamChunk {
  id?: string;
  model?: string;
  created?: number;
  delta?: Partial<ChatMessage> & { tool_calls?: ToolCall[] };
  finish_reason?: string | null;
  raw?: unknown;
}

export type Stream<T> = AsyncIterable<T>;

export interface Provider {
  id: ProviderId;
  name: string;
  chat(req: ChatRequest, apiKey?: string, baseUrl?: string): Promise<ChatResponse>;
  streamChat?(req: ChatRequest, apiKey?: string, baseUrl?: string): Stream<ChatStreamChunk>;
}

export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'groq'
  | 'gemini'
  | 'openrouter'
  | 'sambanova';

export interface ClientConfig {
  defaultProvider?: ProviderId;
  defaultModel?: string;
  apiKeys?: Partial<Record<ProviderId, string>>;
  baseUrls?: Partial<Record<ProviderId, string>>;
  headers?: Partial<Record<ProviderId, Record<string, string>>>;
  proxy?: string; // browser/Next.js proxy URL
}
