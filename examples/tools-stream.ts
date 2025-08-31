import { HRI } from '../src/index';

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY in env.');
    process.exit(1);
  }

  const hri = HRI.createDefault();

  const tools = [
    {
      type: 'function' as const,
      function: {
        name: 'get_time',
        description: 'Get the current time in ISO format',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function' as const,
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

  const handlers = {
    get_time: async () => ({ now: new Date().toISOString() }),
    get_weather: async ({ city }: { city: string }) => ({ city, tempC: 24, sky: 'partly cloudy' }),
  } as const;

  const req = {
    provider: 'openai' as const,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      {
        role: 'system' as const,
        content:
          'You have two tools: get_time() and get_weather(city). You must call these tools to obtain real values. Do not claim inability or guess; always call tools when asked about time or weather. After tools respond, summarize briefly.',
      },
      {
        role: 'user' as const,
        content:
          'What is the current time, and what is the weather in San Francisco? Use the tools and then answer in one sentence.',
      },
    ],
    tools,
    // Require at least one tool call in the first turn, but let the model choose which tool.
    tool_choice: 'required' as const,
    temperature: 0.2,
    max_tokens: 300,
  };

  let text = '';
  for await (const chunk of hri.streamWithTools(req, handlers as any, { maxCalls: 3 })) {
    const part = chunk.delta?.content;
    if (typeof part === 'string') {
      text += part;
      process.stdout.write(part);
    }
  }
  if (!text) {
    console.log('\n(no streamed text — model may have only returned tool calls)');
  } else {
    console.log('\n\n— end of stream —');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
