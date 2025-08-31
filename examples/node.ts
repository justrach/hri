import { HRI } from '../src/index';

async function main() {
  const hri = HRI.createDefault();

  // Basic non-streaming chat
  const res = await hri.chat({
    provider: 'openai',
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a concise assistant.' },
      { role: 'user', content: 'In one sentence, what is HRI?' },
    ],
  });
  console.log('\nNon-streaming response:');
  console.log(res.choices[0]?.message?.content ?? '(no content)');

  // Streaming chat aggregated to text
  const text = await hri.streamToText({
    provider: 'openai',
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a concise assistant.' },
      { role: 'user', content: 'List 3 bullet points about HRI.' },
    ],
    stream: true,
  });
  console.log('\nStreaming aggregated:');
  console.log(text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
