# hri

TypeScript-native, lightweight multi-LLM client ("LiteLLM for JS") with DHI-based validation. Works in Node, Bun, Browser, and Next.js. Provider pattern inspired by Continue.

- Supports multiple providers via a simple registry (`openai`, `anthropic`, easy to add more)
- Friendly API for chat + streaming
- DHI-powered validation of requests
- Browser/Next.js friendly `fetch` transport with optional proxy

## Install

Prereqs: Node 18+ or Bun 1.0+

Local dev (uses local `dhi`):

```sh
bun install
```

Build:

```sh
bun run build
```

Run example (requires .env with OPENAI_API_KEY):

```sh
bun run examples/node.ts
```

## Quickstart (Bun/Node)

```ts
import { HRI } from 'hri';

const hri = HRI.createDefault();

// Option A: DX-friendly target string (provider/model)
const res = await hri.chat('openai/gpt-4o-mini', {
  messages: [
    { role: 'system', content: 'You are a concise assistant.' },
    { role: 'user', content: 'One sentence on hri?' },
  ],
});
console.log(res.choices[0]?.message?.content);

// Streaming aggregate
const text = await hri.streamToText('openai/gpt-4o-mini', {
  messages: [
    { role: 'system', content: 'You are a concise assistant.' },
    { role: 'user', content: 'List 3 bullet points about hri.' },
  ],
  stream: true,
});
console.log(text);

// Also supports multi-segment models when routed via another provider,
// e.g. Groq serving OpenAI OSS models:
await hri.chat('groq/openai/gpt-oss-20b', {
  messages: [ { role: 'user', content: 'Hello OSS!' } ],
});

// Generic V1 provider: point to any OpenAI-compatible /v1 endpoint
const hriV1 = HRI.createDefault({
  baseUrls: { v1: process.env.V1_BASE_URL || 'https://your-host.example.com/v1' },
  apiKeys: { v1: process.env.V1_API_KEY || 'YOUR_KEY' },
});
// Use 'v1/<model>' or multi-segment like 'v1/openai/gpt-oss-20b'
await hriV1.chat('v1/openai/gpt-oss-20b', {
  messages: [ { role: 'user', content: 'Hello from custom v1 endpoint!' } ],
});

// Check if a model exists via /models with helpful diagnostics
const check = await hriV1.verifyModel('v1/openai/gpt-oss-20b');
console.log('verifyModel:', check);
```

Environment variables are read automatically if present (OPENAI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, SAMBANOVA_API_KEY, CEREBRAS_API_KEY, V1_API_KEY). With Bun, `.env` is auto-loaded. For Node, use `dotenv` if needed.

## Browser & Next.js

Direct calls from the browser to most providers require CORS handling. Use a simple proxy or Next.js API route.

- Browser usage with a proxy base URL:

```ts
import { HRI } from 'hri';

const hri = HRI.createDefault({ proxy: '/api/llm' });
await hri.chat('openai/gpt-4o-mini', {
  messages: [ { role: 'user', content: 'Hello' } ],
});
```

- Example Next.js route (app router):

```ts
// app/api/llm/openai/route.ts
export const runtime = 'edge';

export async function POST(req: Request) {
  const body = await req.json();
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return new Response(resp.body, {
    status: resp.status,
    headers: { 'Content-Type': resp.headers.get('Content-Type') ?? 'application/json' },
  });
}
```

Generic v1-compatible route for custom endpoints:

```ts
// app/api/llm/v1/route.ts
export const runtime = 'edge';

export async function GET() {
  // Proxy /models for verification and debugging
  const resp = await fetch(`${process.env.V1_BASE_URL}/models`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${process.env.V1_API_KEY}` },
  });
  return new Response(resp.body, {
    status: resp.status,
    headers: { 'Content-Type': resp.headers.get('Content-Type') ?? 'application/json' },
  });
}

export async function POST(req: Request) {
  // Proxy /chat/completions for generic v1
  const body = await req.json();
  const resp = await fetch(`${process.env.V1_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.V1_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return new Response(resp.body, {
    status: resp.status,
    headers: { 'Content-Type': resp.headers.get('Content-Type') ?? 'application/json' },
  });
}
```

In your app, set `proxy: '/api/llm'` and hri will map `openai` and `anthropic` to sensible defaults under that prefix. You can override providers via `baseUrls`.

## Providers

- OpenAI: non-stream + streaming via SSE
- Anthropic: non-stream + streaming via SSE

To add a provider, implement the `Provider` interface and register via `hri.use(new MyProvider())`.

## Validation

Request payloads are validated using [`dhi`](https://github.com/your-org/dhi) schemas in `src/core/validation.ts`.

## Examples

See `examples/node.ts` for a ready-to-run script.

## License

MIT
