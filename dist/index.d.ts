import { ProviderRegistry } from './core/registry';
import type { ChatRequest, ChatResponse, ChatStreamChunk, Provider, ClientConfig } from './core/types';
export * from './core/types';
export { validateChatRequest } from './core/validation';
export { ProviderRegistry } from './core/registry';
export { OpenAIProvider } from './providers/openai';
export { AnthropicProvider } from './providers/anthropic';
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
}
