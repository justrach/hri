export type Role = 'system' | 'user' | 'assistant' | 'tool';
export interface TextPart {
    type: 'text';
    text: string;
}
export interface ImageUrlPart {
    type: 'image_url';
    image_url: {
        url: string;
    };
}
export type ContentPart = TextPart | ImageUrlPart;
export interface ChatMessage {
    role: Role;
    content: string | ContentPart[];
    name?: string;
    tool_call_id?: string;
    tool_calls?: ToolCall[];
}
export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}
export interface FunctionToolDef {
    type: 'function';
    function: {
        name: string;
        description?: string;
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
    json?: boolean;
    extraHeaders?: Record<string, string>;
    signal?: AbortSignal;
    tools?: ToolDef[];
    tool_choice?: 'auto' | 'none' | 'required' | {
        type: 'function';
        function: {
            name: string;
        };
    };
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
    delta?: Partial<ChatMessage> & {
        tool_calls?: ToolCall[];
    };
    finish_reason?: string | null;
    raw?: unknown;
}
export type Stream<T> = AsyncIterable<T>;
export interface Provider {
    id: ProviderId;
    name: string;
    chat(req: ChatRequest, apiKey?: string, baseUrl?: string): Promise<ChatResponse>;
    streamChat?(req: ChatRequest, apiKey?: string, baseUrl?: string): Stream<ChatStreamChunk>;
    listModels?(apiKey?: string, baseUrl?: string): Promise<string[]>;
}
export type ProviderId = 'openai' | 'anthropic' | 'groq' | 'gemini' | 'openrouter' | 'sambanova' | 'cerebras' | 'v1';
export interface ClientConfig {
    defaultProvider?: ProviderId;
    defaultModel?: string;
    apiKeys?: Partial<Record<ProviderId, string>>;
    baseUrls?: Partial<Record<ProviderId, string>>;
    headers?: Partial<Record<ProviderId, Record<string, string>>>;
    proxy?: string;
    onUsage?: (usage: ChatResponse['usage'] | undefined, meta: {
        provider: ProviderId;
        model: string;
    }) => void;
}
