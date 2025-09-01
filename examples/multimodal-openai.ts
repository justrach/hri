import { HRI } from '../src/index';

// Example: send an image alongside text to OpenAI and log token usage via onUsage hook
// Usage:
//   OPENAI_API_KEY=... bun run examples/multimodal-openai.ts
// Optional:
//   OPENAI_MODEL=gpt-4o-mini
//   OPENAI_BASE_URL=...

async function main() {
  const usageLog: any[] = [];
  const hri = HRI.createDefault({
    baseUrls: process.env.OPENAI_BASE_URL ? { openai: process.env.OPENAI_BASE_URL } : undefined,
    onUsage: (usage, meta) => {
      usageLog.push({ meta, usage });
    },
  });

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const imageUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Gull_portrait_ca_usa.jpg/640px-Gull_portrait_ca_usa.jpg';

  const res = await hri.chat('openai/' + model, {
    messages: [
      { role: 'system', content: 'You are a concise assistant.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What bird is in this photo? Answer with a single word.' },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
  });

  const answer = res.choices?.[0]?.message?.content;
  console.log('Answer:', typeof answer === 'string' ? answer : JSON.stringify(answer));

  // Show token usage (if provided by provider)
  const u = res.usage;
  if (u) {
    console.log(`Usage total=${u.total_tokens ?? '-'} input=${u.prompt_tokens ?? '-'} output=${u.completion_tokens ?? '-'}`);
  } else {
    console.log('Usage not provided by the provider for this call.');
  }

  // Also demonstrate the onUsage hook capture
  if (usageLog.length) {
    console.log('onUsage captured:', JSON.stringify(usageLog, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
