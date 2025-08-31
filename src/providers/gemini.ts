import { http, joinUrl, parseSSE } from '../core/transport';
import type { Provider, ChatRequest, ChatResponse, ChatStreamChunk, ChatMessage } from '../core/types';

// Google Generative Language OpenAI-compatible endpoint
const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';

function toChatResponse(json: any, providerId: 'gemini'): ChatResponse {
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

export class GeminiProvider implements Provider {
  id = 'gemini' as const;
  name = 'Gemini (OpenAI-compatible)';
  private isGpt5(model: string): boolean {
    try { return /(^|\/)gpt-5/i.test(model); } catch { return false; }
  }

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
      stream: false,
    };
    if (req.max_tokens != null) {
      if (this.isGpt5(req.model)) (body as any).max_completion_tokens = req.max_tokens;
      else (body as any).max_tokens = req.max_tokens;
    }
    if (req.tools) body.tools = req.tools;
    if (req.tool_choice) body.tool_choice = req.tool_choice;
    if (req.json) body.response_format = { type: 'json_object' };
    const res = await http(url, { method: 'POST', headers, body, signal: req.signal });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini error ${res.status}: ${text}`);
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
      stream: true,
    };
    if (req.max_tokens != null) {
      if (this.isGpt5(req.model)) (body as any).max_completion_tokens = req.max_tokens;
      else (body as any).max_tokens = req.max_tokens;
    }
    if (req.tools) body.tools = req.tools;
    if (req.tool_choice) body.tool_choice = req.tool_choice;
    if (req.json) body.response_format = { type: 'json_object' };

    const res = await http(url, { method: 'POST', headers, body, signal: req.signal });
    if (!res.ok || !res.body) {
      const text = await res.text();
      throw new Error(`Gemini stream error ${res.status}: ${text}`);
    }

    for await (const evt of parseSSE(res.body)) {
      if (!evt || !evt.data) continue;
      if (evt.data === '[DONE]') return;
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
            tool_calls: Array.isArray(delta.tool_calls)
              ? delta.tool_calls.map((t: any) => ({
                  id: t.id ?? String(t.index ?? 0),
                  type: 'function',
                  function: {
                    name: t.function?.name,
                    arguments: t.function?.arguments ?? '',
                  },
                }))
              : undefined,
          },
          finish_reason: choice?.finish_reason ?? null,
          raw: json,
        };
        yield chunk;
      } catch {
        // ignore
      }
    }
  }
}
