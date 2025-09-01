import { describe, it, expect } from 'bun:test';
import { parseTargetString, normalizeProviderModel } from '../src/core/resolve';

describe('target resolver', () => {
  it('parses provider/model path', () => {
    const { provider, model } = parseTargetString('openai/gpt-4o-mini');
    expect(provider).toBe('openai');
    expect(model).toBe('gpt-4o-mini');
  });

  it('supports multi-segment model after provider', () => {
    const { provider, model } = parseTargetString('groq/openai/gpt-oss-20b');
    expect(provider).toBe('groq');
    expect(model).toBe('openai/gpt-oss-20b');
  });

  it('infers provider from known model prefixes', () => {
    const { provider, model } = parseTargetString('gpt-4o-mini');
    expect(provider).toBe('openai');
    expect(model).toBe('gpt-4o-mini');
  });

  it('normalizes from string input', () => {
    const r = normalizeProviderModel('openai/gpt-4o-mini');
    expect(r.provider).toBe('openai');
    expect(r.model).toBe('gpt-4o-mini');
  });

  it('normalizes from object with target', () => {
    const r = normalizeProviderModel({ target: 'groq/openai/gpt-oss-20b' } as any);
    expect(r.provider).toBe('groq');
    expect(r.model).toBe('openai/gpt-oss-20b');
  });
});

