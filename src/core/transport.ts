export type HeadersInit = Record<string, string>;

export interface RequestOptions {
  method?: string;
  headers?: HeadersInit;
  body?: any;
  signal?: AbortSignal;
}

export function joinUrl(base: string, path: string): string {
  if (path.startsWith('http')) return path;
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export async function http(url: string, opts: RequestOptions = {}): Promise<Response> {
  const { method = 'POST', headers = {}, body, signal } = opts;
  const init: RequestInit = {
    method,
    headers,
    body: typeof body === 'string' || body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined,
    signal,
  } as RequestInit;
  return fetch(url, init);
}

export async function* readLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        yield line.replace(/\r$/, '');
      }
    }
    if (buffer.length > 0) {
      yield buffer;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* parseSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<{ event?: string; data?: string } | null> {
  let dataLines: string[] = [];
  let event: string | undefined;
  for await (const line of readLines(stream)) {
    if (line === '') {
      const data = dataLines.length ? dataLines.join('\n') : undefined;
      yield data || event ? { event, data } : null;
      dataLines = [];
      event = undefined;
      continue;
    }
    if (line.startsWith(':')) {
      continue; // comment
    }
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    const value = idx === -1 ? '' : line.slice(idx + 1).replace(/^\s*/, '');
    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }
}
