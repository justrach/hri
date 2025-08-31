import { http, joinUrl, parseSSE } from '../core/transport';
import type { Provider, ChatRequest, ChatResponse, ChatStreamChunk, ChatMessage } from '../core/types';

const DEFAULT_BASE = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';

function toAnthropicMessages(req: ChatRequest): { system?: string; messages: { role: 'user' | 'assistant'; content: string }[] } {
  const systemParts: string[] = [];
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of req.messages) {
    if (m.role === 'system') {
      systemParts.push(m.content);
    } else if (m.role === 'user' || m.role === 'assistant') {
      messages.push({ role: m.role, content: m.content });
    }
    // ignore tool for now in stub
  }
  const system = systemParts.length ? systemParts.join('\n') : undefined;
  return { system, messages };
}

function toChatResponse(json: any, providerId: 'anthropic', model: string): ChatResponse {
  const text = Array.isArray(json.content) ? json.content.map((b: any) => b.text || '').join('') : json.content?.[0]?.text || '';
  const msg: ChatMessage = { role: 'assistant', content: text };
  return {
    id: json.id ?? 'unknown',
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [{ index: 0, message: msg, finish_reason: json.stop_reason ?? null }],
    provider: providerId,
    raw: json,
  };
}

export class AnthropicProvider implements Provider {
  id = 'anthropic' as const;
  name = 'Anthropic';

  async chat(req: ChatRequest, apiKey?: string, baseUrl?: string): Promise<ChatResponse> {
    const path = '/v1/messages';
    const url = joinUrl(baseUrl || DEFAULT_BASE, path);
    const { system, messages } = toAnthropicMessages(req);
    const headers = {
      'x-api-key': apiKey || '',
      'content-type': 'application/json',
      'anthropic-version': API_VERSION,
      ...(req.extraHeaders || {}),
    };
    const body: any = {
      model: req.model,
      max_tokens: req.max_tokens ?? 1024,
      temperature: req.temperature,
      system,
      messages,
    };
    const res = await http(url, { method: 'POST', headers, body, signal: req.signal });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic error ${res.status}: ${text}`);
    }
    const json = await res.json();
    return toChatResponse(json, this.id, req.model);
  }

  async *streamChat(req: ChatRequest, apiKey?: string, baseUrl?: string) {
    const path = '/v1/messages';
    const url = joinUrl(baseUrl || DEFAULT_BASE, path);
    const { system, messages } = toAnthropicMessages(req);
    const headers = {
      'x-api-key': apiKey || '',
      'content-type': 'application/json',
      'accept': 'text/event-stream',
      'anthropic-version': API_VERSION,
      ...(req.extraHeaders || {}),
    };
    const body: any = {
      model: req.model,
      max_tokens: req.max_tokens ?? 1024,
      temperature: req.temperature,
      system,
      messages,
      stream: true,
    };
    const res = await http(url, { method: 'POST', headers, body, signal: req.signal });
    if (!res.ok || !res.body) {
      const text = await res.text();
      throw new Error(`Anthropic stream error ${res.status}: ${text}`);
    }
    for await (const evt of parseSSE(res.body)) {
      if (!evt || !evt.data) continue;
      try {
        const json = JSON.parse(evt.data);
        const type = json.type as string | undefined;
        if (type === 'content_block_delta' && json.delta?.type === 'text_delta') {
          const chunk: ChatStreamChunk = {
            delta: { role: 'assistant', content: json.delta.text || '' },
            raw: json,
          };
          yield chunk;
        } else if (type === 'message_stop') {
          return;
        }
      } catch {
        // ignore
      }
    }
  }
}
