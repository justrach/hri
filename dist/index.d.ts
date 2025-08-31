import { ProviderRegistry } from './core/registry';
import type { ChatRequest, ChatResponse, ChatStreamChunk, Provider, ClientConfig, ToolDef } from './core/types';
export * from './core/types';
export { validateChatRequest } from './core/validation';
export { ProviderRegistry } from './core/registry';
export { OpenAIProvider } from './providers/openai';
export { AnthropicProvider } from './providers/anthropic';
export { GroqProvider } from './providers/groq';
export { OpenRouterProvider } from './providers/openrouter';
export { SambaNovaProvider } from './providers/sambanova';
export { GeminiProvider } from './providers/gemini';
export declare class HRI {
    readonly registry: ProviderRegistry;
    private config;
    constructor(config?: ClientConfig, registry?: ProviderRegistry);
    static createDefault(config?: ClientConfig): HRI;
    use(provider: Provider): this;
    private apiKeyFor;
    private baseUrlFor;
    chat(req: ChatRequest): Promise<ChatResponse>;
    streamChat(req: ChatRequest): AsyncIterable<ChatStreamChunk>;
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
}
