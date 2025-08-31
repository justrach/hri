export type HeadersInit = Record<string, string>;
export interface RequestOptions {
    method?: string;
    headers?: HeadersInit;
    body?: any;
    signal?: AbortSignal;
}
export declare function joinUrl(base: string, path: string): string;
export declare function http(url: string, opts?: RequestOptions): Promise<Response>;
export declare function readLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string>;
export declare function parseSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<{
    event?: string;
    data?: string;
} | null>;
