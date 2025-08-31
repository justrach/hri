import type { Provider, ChatRequest, ChatResponse, ChatStreamChunk } from '../core/types';
export declare class SambaNovaProvider implements Provider {
    id: "sambanova";
    name: string;
    private isGpt5;
    chat(req: ChatRequest, apiKey?: string, baseUrl?: string): Promise<ChatResponse>;
    streamChat(req: ChatRequest, apiKey?: string, baseUrl?: string): AsyncGenerator<ChatStreamChunk, void, unknown>;
}
