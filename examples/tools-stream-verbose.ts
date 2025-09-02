import { HRI, type ChatStreamChunk, type ToolDef } from '../src/index';

// Verbose streaming with tools
// - Logs content deltas and tool_call deltas as they stream
// - Wraps tool handlers to log typed args/results
// - Accumulates final assistant text
//
// Run (Bun):
//   bun --env-file=.env examples/tools-stream-verbose.ts
// Run (Node):
//   node --env-file=.env --import tsx examples/tools-stream-verbose.ts

// Tool result types
interface GetTimeResult { now: string }
interface GetWeatherArgs { city: string }
interface GetWeatherResult { city: string; tempC: number; sky: string }

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY in env.');
    process.exit(1);
  }

  const hri = HRI.createDefault();

  // Define OpenAI-style tools with explicit type annotation
  const tools: ToolDef[] = [
    {
      type: 'function',
      function: {
        name: 'get_time',
        description: 'Get the current time in ISO format',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get fake weather by city (demo tool)',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
          additionalProperties: false,
        },
      },
    },
  ];

  // Implement typed handlers
  const handlers = {
    get_time: async (): Promise<GetTimeResult> => ({ now: new Date().toISOString() }),
    get_weather: async ({ city }: GetWeatherArgs): Promise<GetWeatherResult> => ({ city, tempC: 24, sky: 'partly cloudy' }),
  } as const;

  // Wrap handlers to log calls/results
  const loggedHandlers: Record<string, (args: any) => Promise<any>> = Object.fromEntries(
    Object.entries(handlers).map(([name, fn]) => [
      name,
      async (args: any) => {
        console.log(`\n[tool.invoke] ${name} args:`, args);
        const out = await (fn as any)(args);
        console.log(`[tool.result] ${name} ->`, out);
        return out;
      },
    ])
  );

  const req = {
    provider: 'openai' as const,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      {
        role: 'system' as const,
        content:
          'You have tools: get_time() and get_weather(city). Always call tools for time/weather. After tools respond, answer concisely.',
      },
      {
        role: 'user' as const,
        content: 'What is the current time, and the weather in San Francisco? Use tools and answer in one sentence.',
      },
    ],
    tools,
    // Force at least one tool in first turn; HRI will switch to auto/none internally on subsequent turns
    tool_choice: 'required' as const,
    temperature: 0.2,
    max_tokens: 300,
  };

  // For demo: accumulate tool_call argument fragments we see in deltas (by id)
  const seenToolDeltas = new Map<string, { name?: string; args: string }>();

  function logChunk(c: ChatStreamChunk) {
    // Log basic info when present
    if (c.finish_reason) console.log(`[finish_reason]`, c.finish_reason);
    if (c.delta?.content && typeof c.delta.content === 'string') {
      process.stdout.write(c.delta.content);
    }

    const tcs = c.delta?.tool_calls;
    if (Array.isArray(tcs) && tcs.length) {
      for (const t of tcs) {
        const id = t.id || '0';
        const name = t.function?.name;
        const argsFrag = t.function?.arguments ?? '';
        const acc = seenToolDeltas.get(id) ?? { name, args: '' };
        if (name) acc.name = name;
        if (argsFrag) acc.args += argsFrag;
        seenToolDeltas.set(id, acc);
        console.log(`\n[stream.tool_delta] id=${id} name=${name ?? '(partial)'} args+=${JSON.stringify(argsFrag)}`);
      }
    }
  }

  let finalText = '';
  for await (const chunk of hri.streamWithTools(req, loggedHandlers, { maxCalls: 3 })) {
    // Show types explicitly via annotation in local variable (for dev ergonomics)
    const typedChunk: ChatStreamChunk = chunk;
    logChunk(typedChunk);
    const part = typedChunk.delta?.content;
    if (typeof part === 'string') finalText += part;
  }

  if (!finalText) {
    console.log('\n(no streamed text — model may have only returned tool calls)');
  } else {
    console.log('\n\n— end of stream —');
  }

  // After streaming, print the reconstructed tool calls we observed
  if (seenToolDeltas.size) {
    console.log('\nObserved tool_calls (reconstructed from streaming deltas):');
    for (const [id, v] of seenToolDeltas) {
      // Attempt to JSON-parse args for readability
      let parsed: any = v.args;
      try { parsed = JSON.parse(v.args || '{}'); } catch {}
      console.log(` - ${id}: ${v.name ?? '(unknown)'}(${JSON.stringify(parsed)})`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
