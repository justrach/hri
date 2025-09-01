import { ProviderRegistry } from './core/registry';
import type { ChatRequest, ChatResponse, ChatStreamChunk, ProviderId, Provider, ClientConfig, ToolDef } from './core/types';
export * from './core/types';
export { validateChatRequest } from './core/validation';
export { ProviderRegistry } from './core/registry';
export { OpenAIProvider } from './providers/openai';
export { AnthropicProvider } from './providers/anthropic';
export { GroqProvider } from './providers/groq';
export { OpenRouterProvider } from './providers/openrouter';
export { SambaNovaProvider } from './providers/sambanova';
export { GeminiProvider } from './providers/gemini';
export { CerebrasProvider } from './providers/cerebras';
export { V1Provider } from './providers/v1';
export declare class HRI {
    readonly registry: ProviderRegistry;
    private config;
    constructor(config?: ClientConfig, registry?: ProviderRegistry);
    static createDefault(config?: ClientConfig): HRI;
    use(provider: Provider): this;
    private apiKeyFor;
    private baseUrlFor;
    chat(target: string, init: Omit<ChatRequest, 'provider' | 'model'>): Promise<ChatResponse>;
    chat(req: ChatRequest): Promise<ChatResponse>;
    streamChat(target: string, init: Omit<ChatRequest, 'provider' | 'model'> & {
        stream?: true;
    }): AsyncIterable<ChatStreamChunk>;
    streamChat(req: ChatRequest): AsyncIterable<ChatStreamChunk>;
    streamToText(target: string, init: Omit<ChatRequest, 'provider' | 'model'> & {
        stream?: true;
    }): Promise<string>;
    streamToText(req: ChatRequest): Promise<string>;
    chatWithTools(req: ChatRequest & {
        tools?: ToolDef[];
        tool_choice?: ChatRequest['tool_choice'];
    }, handlers: Record<string, (args: any) => any | Promise<any>>, opts?: {
        maxCalls?: number;
    }): Promise<ChatResponse>;
    streamWithTools(req: ChatRequest & {
        tools?: ToolDef[];
        tool_choice?: ChatRequest['tool_choice'];
    }, handlers: Record<string, (args: any) => any | Promise<any>>, opts?: {
        maxCalls?: number;
    }): AsyncIterable<ChatStreamChunk>;
    verifyModel(target: string | ChatRequest): Promise<{
        exists: boolean;
        provider: ProviderId;
        model: string;
        models?: string[];
        status?: number;
        error?: string;
    }>;
    private normalizeInput;
}
export interface PartialChatInit extends Partial<Omit<ChatRequest, 'provider' | 'model'>> {
    provider?: string;
    model?: string;
    target?: string;
}
