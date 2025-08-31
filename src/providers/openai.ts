import { http, joinUrl, parseSSE } from '../core/transport';
import type { Provider, ChatRequest, ChatResponse, ChatStreamChunk, ChatMessage } from '../core/types';

const DEFAULT_BASE = 'https://api.openai.com/v1';

function toChatResponse(json: any, providerId: 'openai'): ChatResponse {
  const choices = (json.choices ?? []).map((c: any, i: number) => ({
    index: c.index ?? i,
    message: (c.message ?? { role: 'assistant', content: '' }) as ChatMessage,
    finish_reason: c.finish_reason ?? null,
  }));
  return {
    id: json.id ?? 'unknown',
    created: json.created ?? Math.floor(Date.now() / 1000),
    model: json.model ?? 'unknown',
    choices,
    usage: json.usage,
    provider: providerId,
    raw: json,
  };
}

function mergeHeaders(a?: Record<string, string>, b?: Record<string, string>): Record<string, string> {
  return { ...(a || {}), ...(b || {}) };
}

export class OpenAIProvider implements Provider {
  id = 'openai' as const;
  name = 'OpenAI';

  async chat(req: ChatRequest, apiKey?: string, baseUrl?: string): Promise<ChatResponse> {
    const url = joinUrl(baseUrl || DEFAULT_BASE, '/chat/completions');
    const headers = mergeHeaders(
      {
        'Authorization': `Bearer ${apiKey || ''}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      req.extraHeaders
    );
    const body: any = {
      model: req.model,
      messages: req.messages,
      temperature: req.temperature,
      top_p: req.top_p,
      max_tokens: req.max_tokens,
      stream: false,
    };
    if (req.json) {
      body.response_format = { type: 'json_object' };
    }
    const res = await http(url, { method: 'POST', headers, body, signal: req.signal });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI error ${res.status}: ${text}`);
    }
    const json = await res.json();
    return toChatResponse(json, this.id);
  }

  async *streamChat(req: ChatRequest, apiKey?: string, baseUrl?: string) {
    const url = joinUrl(baseUrl || DEFAULT_BASE, '/chat/completions');
    const headers = mergeHeaders(
      {
        'Authorization': `Bearer ${apiKey || ''}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      req.extraHeaders
    );
    const body: any = {
      model: req.model,
      messages: req.messages,
      temperature: req.temperature,
      top_p: req.top_p,
      max_tokens: req.max_tokens,
      stream: true,
    };
    if (req.json) {
      body.response_format = { type: 'json_object' };
    }

    const res = await http(url, { method: 'POST', headers, body, signal: req.signal });
    if (!res.ok || !res.body) {
      const text = await res.text();
      throw new Error(`OpenAI stream error ${res.status}: ${text}`);
    }

    for await (const evt of parseSSE(res.body)) {
      if (!evt || !evt.data) continue;
      if (evt.data === '[DONE]') {
        return;
      }
      try {
        const json = JSON.parse(evt.data);
        const choice = json.choices?.[0];
        const delta = choice?.delta || {};
        const chunk: ChatStreamChunk = {
          id: json.id,
          created: json.created,
          model: json.model,
          delta: {
            role: delta.role,
            content: delta.content,
          },
          finish_reason: choice?.finish_reason ?? null,
          raw: json,
        };
        yield chunk;
      } catch (e) {
        // ignore parse errors for non-data lines
      }
    }
  }
}
