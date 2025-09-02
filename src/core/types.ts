export type Role = 'system' | 'user' | 'assistant' | 'tool';

// Multimodal content parts (OpenAI-compatible subset)
export interface TextPart { type: 'text'; text: string }
export interface ImageUrlPart { type: 'image_url'; image_url: { url: string } }
export type ContentPart = TextPart | ImageUrlPart;

export interface ChatMessage {
  role: Role;
  // Either a plain string or structured parts for multimodal (text + images)
  content: string | ContentPart[];
  name?: string;
  tool_call_id?: string;
  // When assistant triggers tools (OpenAI-compatible)
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

// OpenAI-compatible tool definition
export interface FunctionToolDef {
  type: 'function';
  function: {
    name: string;
    description?: string;
    // JSON Schema for parameters
    parameters?: unknown;
  };
}
export type ToolDef = FunctionToolDef;

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
  // OpenAI-compatible tool support (optional)
  tools?: ToolDef[];
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  // Internal: optional telemetry propagation (not part of public surface)
  __telemetry?: TelemetryHooks;
  __requestId?: string;
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
  // Optional: list models (OpenAI v1-compatible)
  listModels?(apiKey?: string, baseUrl?: string): Promise<string[]>;
}

export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'groq'
  | 'gemini'
  | 'openrouter'
  | 'sambanova'
  | 'cerebras'
  | 'v1';

export interface ClientConfig {
  defaultProvider?: ProviderId;
  defaultModel?: string;
  apiKeys?: Partial<Record<ProviderId, string>>;
  baseUrls?: Partial<Record<ProviderId, string>>;
  headers?: Partial<Record<ProviderId, Record<string, string>>>;
  proxy?: string; // browser/Next.js proxy URL
  // Optional hook to inspect/log token usage returned by providers
  onUsage?: (usage: ChatResponse['usage'] | undefined, meta: { provider: ProviderId; model: string }) => void;
  // Optional observability hooks (no-op by default)
  telemetry?: TelemetryHooks;
  // Guard capturing of prompt/response bodies in any adapters
  captureBodies?: boolean;
}

// Minimal, OTEL-agnostic telemetry hook surface
export interface TelemetryHooks {
  requestStart(info: {
    url: string;
    method?: string;
    provider?: ProviderId;
    model?: string;
    stream?: boolean;
    requestId?: string;
  }): {
    end(extra?: { status?: number; ok?: boolean; sizeBytes?: number; durationMs?: number }): void;
    recordError(err: unknown): void;
  };

  streamStart(info: { provider?: ProviderId; model?: string; requestId?: string }): {
    firstByte(): void;
    chunk(count?: number): void; // default 1
    end(extra?: { chunkCount?: number; durationMs?: number; completed?: boolean }): void;
  };

  toolStart(info: { name: string; requestId?: string }): {
    end(extra?: { durationMs?: number }): void;
    recordError(err: unknown): void;
  };
}
