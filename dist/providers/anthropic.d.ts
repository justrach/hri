import type { Provider, ChatRequest, ChatResponse, ChatStreamChunk } from '../core/types';
export declare class AnthropicProvider implements Provider {
    id: "anthropic";
    name: string;
    chat(req: ChatRequest, apiKey?: string, baseUrl?: string): Promise<ChatResponse>;
    streamChat(req: ChatRequest, apiKey?: string, baseUrl?: string): AsyncGenerator<ChatStreamChunk, void, unknown>;
}
