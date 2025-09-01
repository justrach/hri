import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { HRI } from '../src/index';

describe('HRI.verifyModel', () => {
  beforeEach(() => {
    (globalThis as any).fetch = mock();
  });

  it('returns exists=true when model is listed by v1 /models', async () => {
    const hri = HRI.createDefault({
      baseUrls: { v1: 'https://api.example.com/v1' },
      apiKeys: { v1: 'KEY' },
    });

    // Mock GET /models
    (globalThis as any).fetch.mockImplementation((url: string, init: any) => {
      if (url === 'https://api.example.com/v1/models' && init?.method === 'GET') {
        return Promise.resolve(new Response(JSON.stringify({ data: [{ id: 'openai/gpt-oss-20b' }, { id: 'foo' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return Promise.resolve(new Response('not found', { status: 404 }));
    });

    const res = await hri.verifyModel('v1/openai/gpt-oss-20b');
    expect(res.exists).toBe(true);
    expect(res.models?.includes('openai/gpt-oss-20b')).toBe(true);
  });

  it('includes diagnostics on 401/404 errors', async () => {
    const hri = HRI.createDefault({
      baseUrls: { v1: 'https://api.example.com/v1' },
      apiKeys: { v1: 'BAD' },
    });

    let call = 0;
    (globalThis as any).fetch.mockImplementation((url: string, init: any) => {
      call++;
      if (call === 1) {
        return Promise.resolve(new Response('unauthorized', { status: 401 }));
      }
      return Promise.resolve(new Response('not found', { status: 404 }));
    });

    const res1 = await hri.verifyModel('v1/x');
    expect(res1.exists).toBe(false);
    expect(res1.error?.toLowerCase()).toContain('unauthorized');

    const res2 = await hri.verifyModel('v1/y');
    expect(res2.exists).toBe(false);
    expect(res2.error?.toLowerCase()).toContain('not found');
  });

  it('reports missing base URL for providers without listModels', async () => {
    const hri = HRI.createDefault(); // no proxy, no base for openrouter
    const res = await hri.verifyModel('openrouter/some-model');
    expect(res.exists).toBe(false);
    expect(res.error).toContain('Base URL is not configured');
  });
});

