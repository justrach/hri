import { HRI } from '../src/index';

// Example: send an image to Anthropic (Claude) using content blocks
// Usage:
//   ANTHROPIC_API_KEY=... bun run examples/multimodal-anthropic.ts
// Optional:
//   ANTHROPIC_BASE_URL=https://api.anthropic.com
//   ANTHROPIC_MODEL=claude-3-7-sonnet-2025-05-01

async function main() {
  const hri = HRI.createDefault({
    baseUrls: process.env.ANTHROPIC_BASE_URL ? { anthropic: process.env.ANTHROPIC_BASE_URL } : undefined,
    onUsage: (usage) => {
      if (usage) console.log(`Usage total=${usage.total_tokens ?? '-'} input=${usage.prompt_tokens ?? '-'} output=${usage.completion_tokens ?? '-'}`);
    },
  });

  const model = process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-2025-05-01';
  const imageUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Gull_portrait_ca_usa.jpg/640px-Gull_portrait_ca_usa.jpg';

  const res = await hri.chat('anthropic/' + model, {
    messages: [
      { role: 'system', content: 'You are a helpful, concise assistant.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Identify this bird in one word.' },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
  });

  const answer = res.choices?.[0]?.message?.content;
  console.log('Answer:', typeof answer === 'string' ? answer : JSON.stringify(answer));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
