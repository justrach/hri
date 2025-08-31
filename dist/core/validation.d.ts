import type { ChatRequest, ProviderId } from './types';
export declare const ChatRequestSchema: import("dhi").ObjectSchema<{
    provider: string;
    model: string;
    messages: {
        role: /*elided*/ any;
        content: /*elided*/ any;
        name: /*elided*/ any;
        tool_call_id: /*elided*/ any;
    }[];
    temperature: number | undefined;
    max_tokens: number | undefined;
    top_p: number | undefined;
    stream: boolean | undefined;
    json: boolean | undefined;
    extraHeaders: Record<string, string> | undefined;
}>;
export declare function ensureKnownProvider(id: string): asserts id is ProviderId;
export declare function validateChatRequest(req: unknown): ChatRequest;
