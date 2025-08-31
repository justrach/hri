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

const res = await hri.chat({
  provider: 'openai',
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: 'You are a concise assistant.' },
    { role: 'user', content: 'One sentence on hri?' },
  ],
});
console.log(res.choices[0]?.message?.content);

// Streaming aggregate
const text = await hri.streamToText({
  provider: 'openai',
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: 'You are a concise assistant.' },
    { role: 'user', content: 'List 3 bullet points about hri.' },
  ],
  stream: true,
});
console.log(text);
```

Environment variables are read automatically if present (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.). With Bun, `.env` is auto-loaded. For Node, use `dotenv` if needed.

## Browser & Next.js

Direct calls from the browser to most providers require CORS handling. Use a simple proxy or Next.js API route.

- Browser usage with a proxy base URL:

```ts
import { HRI } from 'hri';

const hri = HRI.createDefault({ proxy: '/api/llm' });
await hri.chat({
  provider: 'openai',
  model: 'gpt-4o-mini',
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
