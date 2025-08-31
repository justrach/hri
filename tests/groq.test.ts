import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { GroqProvider } from '../src/index';
import type { ChatRequest } from '../src/core/types';

function jsonResponse(data: any, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    ...init,
  });
}

function sseResponse(lines: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const l of lines) controller.enqueue(encoder.encode(l + "\n"));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('GroqProvider (OpenAI v1 compatible)', () => {
  const provider = new GroqProvider();

  beforeEach(() => {
    // Reset fetch mock
    (globalThis as any).fetch = mock();
  });

  it('sends correct body/headers for chat', async () => {
    const req: ChatRequest = {
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'user', content: 'Hello' },
      ],
      max_tokens: 64,
      tools: [
        { type: 'function', function: { name: 'ping', parameters: { type: 'object', properties: {} } } },
      ],
      tool_choice: 'auto',
    };

    const mockRes = {
      id: 'id1',
      model: req.model,
      created: Math.floor(Date.now() / 1000),
      choices: [{ index: 0, message: { role: 'assistant', content: 'hi' } }],
    };
    (globalThis as any).fetch.mockImplementation(() => jsonResponse(mockRes));

    const res = await provider.chat(req, 'KEY', 'https://api.groq.com/openai/v1');
    expect(res.choices[0].message.content).toBe('hi');

    const call = (globalThis as any).fetch.mock.calls[0];
    expect(call[0]).toBe('https://api.groq.com/openai/v1/chat/completions');
    const init = call[1];
    expect(init.headers['Authorization']).toContain('Bearer KEY');
    const body = JSON.parse(init.body);
    expect(body.stream).toBe(false);
    expect(body.model).toBe(req.model);
    expect(body.max_tokens).toBe(64);
    expect(Array.isArray(body.tools)).toBe(true);
    expect(body.tool_choice).toBe('auto');
  });

  it('uses max_completion_tokens for gpt-5 models', async () => {
    const req: ChatRequest = {
      provider: 'groq',
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 123,
    };

    (globalThis as any).fetch.mockImplementation(() => jsonResponse({ id: 'x', model: req.model, choices: [{ message: { role: 'assistant', content: '' } }] }));
    await provider.chat(req, 'KEY', 'https://api.groq.com/openai/v1');
    const init = (globalThis as any).fetch.mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.max_tokens).toBeUndefined();
    expect(body.max_completion_tokens).toBe(123);
  });

  it('stream request includes tools and tool_choice', async () => {
    const req: ChatRequest = {
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: 'Use tools' }],
      stream: true,
      tools: [
        { type: 'function', function: { name: 'do_thing', parameters: { type: 'object', properties: { x: { type: 'number' } }, required: ['x'] } } },
      ],
      tool_choice: 'auto',
    } as any;

    (globalThis as any).fetch.mockImplementation(() => sseResponse(['data: [DONE]', '']));
    for await (const _ of provider.streamChat(req, 'KEY', 'https://api.groq.com/openai/v1')) {
      // consume
    }
    const init = (globalThis as any).fetch.mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(Array.isArray(body.tools)).toBe(true);
    expect(body.tool_choice).toBe('auto');
  });
});
