// Quick benchmark: HRI vs official OpenAI SDK
// Usage:
//   OPENAI_API_KEY=... bun run examples/benchmark-openai.ts
// Node with undici pooling:
//   HRI_USE_UNDICI=1 node --env-file=.env --import tsx examples/benchmark-openai.ts
// Options:
//   OPENAI_BASE_URL=...   same endpoint for both clients
//   OPENAI_MODEL=...      model to use (default gpt-4o-mini)
//   BENCH_N=4             number of requests
//   COLD=1                interleave and avoid warm connections (new clients per request,
//                         add 'Connection: close' header where possible)

import { HRI } from '../src/index';

// Lazy import to avoid build dep when not used
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import OpenAI from 'openai';

type RunResult = { durations: number[]; average: number };

async function time<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T } | { ms: number; error: any } > {
  const t0 = Date.now();
  try {
    const value = await fn();
    return { ms: Date.now() - t0, value };
  } catch (error) {
    return { ms: Date.now() - t0, error } as any;
  }
}

function summarize(durations: number[]): RunResult {
  const avg = durations.reduce((a, b) => a + b, 0) / Math.max(1, durations.length);
  return { durations, average: avg };
}

async function runHriOnce(i: number, cold: boolean): Promise<number> {
  const hri = HRI.createDefault({
    baseUrls: process.env.OPENAI_BASE_URL ? { openai: process.env.OPENAI_BASE_URL } : undefined,
  });
  const { ms, error } = await time(() =>
    hri.chat({
      provider: 'openai',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are concise.' },
        { role: 'user', content: `Say hello #${i + 1} in five words.` },
      ],
      // Try to avoid connection reuse in cold mode for HTTP/1.1 servers
      extraHeaders: cold ? { Connection: 'close' } : undefined,
    })
  );
  if ((error as any)) throw error;
  return ms;
}

async function runOpenAIOnce(i: number, cold: boolean): Promise<number> {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
    // Provide a custom fetch to inject Connection: close in cold mode
    fetch: cold
      ? (input: RequestInfo, init?: RequestInit) => {
          const headers = new Headers(init?.headers as any);
          headers.set('Connection', 'close');
          return fetch(input as any, { ...init, headers });
        }
      : undefined,
  });
  const { ms, error } = await time(() =>
    client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are concise.' },
        { role: 'user', content: `Say hello #${i + 1} in five words.` },
      ],
    })
  );
  if ((error as any)) throw error;
  return ms;
}

async function runInterleaved(n: number, cold: boolean): Promise<{ hri: RunResult; oai: RunResult }> {
  const hriDur: number[] = [];
  const oaiDur: number[] = [];
  for (let i = 0; i < n; i++) {
    // Alternate which client goes first to remove order bias
    const first = i % 2 === 0 ? 'hri' : 'oai';
    if (first === 'hri') {
      hriDur.push(await runHriOnce(i, cold));
      oaiDur.push(await runOpenAIOnce(i, cold));
    } else {
      oaiDur.push(await runOpenAIOnce(i, cold));
      hriDur.push(await runHriOnce(i, cold));
    }
  }
  return { hri: summarize(hriDur), oai: summarize(oaiDur) };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY in env.');
    process.exit(1);
  }
  const N = Number(process.env.BENCH_N || 4);
  const COLD = process.env.COLD === '1';
  console.log(`Running ${N} requests for each client...${COLD ? ' (cold mode)' : ''}`);

  const { hri: hriRes, oai: sdkRes } = await runInterleaved(N, COLD);

  const fmt = (xs: number[]) => xs.map((n) => `${n}ms`).join(', ');
  console.log('\nHRI timings:   ', fmt(hriRes.durations), `| avg=${hriRes.average.toFixed(1)}ms`);
  console.log('OpenAI SDK:    ', fmt(sdkRes.durations), `| avg=${sdkRes.average.toFixed(1)}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
