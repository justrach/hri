import { http, joinUrl, parseSSE } from '../core/transport';
import type { Provider, ChatRequest, ChatResponse, ChatStreamChunk, ChatMessage } from '../core/types';

const DEFAULT_BASE = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';

type AnthropicTextBlock = { type: 'text'; text: string };
type AnthropicImageBlock = { type: 'image'; source: { type: 'url'; media_type: string; url: string } };
type AnthropicContentBlock = AnthropicTextBlock | AnthropicImageBlock;

function toAnthropicMessages(
  req: ChatRequest
): { system?: string; messages: { role: 'user' | 'assistant'; content: AnthropicContentBlock[] }[] } {
  const systemParts: string[] = [];
  const messages: { role: 'user' | 'assistant'; content: AnthropicContentBlock[] }[] = [];

  const toBlocks = (c: ChatMessage['content']): AnthropicContentBlock[] => {
    if (typeof c === 'string') return c.trim() ? [{ type: 'text', text: c }] : [];
    const blocks: AnthropicContentBlock[] = [];
    for (const p of c || []) {
      if (!p) continue;
      if (p.type === 'text') {
        if (p.text && p.text.length) blocks.push({ type: 'text', text: p.text });
      } else if (p.type === 'image_url' && p.image_url?.url) {
        // Best-effort media type guess by extension; fallback to generic
        const url = p.image_url.url;
        const lower = url.toLowerCase();
        const media = lower.endsWith('.png')
          ? 'image/png'
          : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
          ? 'image/jpeg'
          : lower.endsWith('.webp')
          ? 'image/webp'
          : 'image/*';
        blocks.push({ type: 'image', source: { type: 'url', media_type: media, url } });
      }
    }
    return blocks;
  };

  for (const m of req.messages) {
    if (m.role === 'system') {
      // System supports only text; flatten any text parts
      const txt = toBlocks(m.content)
        .filter((b): b is AnthropicTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (txt) systemParts.push(txt);
    } else if (m.role === 'user' || m.role === 'assistant') {
      const content = toBlocks(m.content);
      messages.push({ role: m.role, content });
    }
    // ignore tool role for now
  }
  const system = systemParts.length ? systemParts.join('\n') : undefined;
  return { system, messages };
}

function toChatResponse(json: any, providerId: 'anthropic', model: string): ChatResponse {
  const text = Array.isArray(json.content) ? json.content.map((b: any) => b.text || '').join('') : json.content?.[0]?.text || '';
  const msg: ChatMessage = { role: 'assistant', content: text };
  const usage = json?.usage
    ? {
        prompt_tokens: json.usage.input_tokens,
        completion_tokens: json.usage.output_tokens,
        total_tokens: typeof json.usage.total_tokens === 'number' ? json.usage.total_tokens : (json.usage.input_tokens ?? 0) + (json.usage.output_tokens ?? 0),
      }
    : undefined;
  return {
    id: json.id ?? 'unknown',
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [{ index: 0, message: msg, finish_reason: json.stop_reason ?? null }],
    provider: providerId,
    usage,
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
    const res = await http(url, {
      method: 'POST',
      headers,
      body,
      signal: req.signal,
      provider: this.id,
      model: req.model,
      stream: false,
      telemetry: (req as any).__telemetry,
    });
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
    const res = await http(url, {
      method: 'POST',
      headers,
      body,
      signal: req.signal,
      provider: this.id,
      model: req.model,
      stream: true,
      telemetry: (req as any).__telemetry,
    });
    if (!res.ok || !res.body) {
      const text = await res.text();
      throw new Error(`Anthropic stream error ${res.status}: ${text}`);
    }
    for await (const evt of parseSSE(res.body, { telemetry: (req as any).__telemetry, provider: this.id, model: req.model })) {
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
