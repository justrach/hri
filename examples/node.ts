import { HRI } from '../src/index';

async function main() {
  const hri = HRI.createDefault();

  // Basic non-streaming chat
  const res = await hri.chat('openai/gpt-4o-mini', {
    messages: [
      { role: 'system', content: 'You are a concise assistant.' },
      { role: 'user', content: 'In one sentence, what is HRI?' },
    ],
  });
  console.log('\nNon-streaming response:');
  console.log(res.choices[0]?.message?.content ?? '(no content)');

  // Streaming chat aggregated to text
  const text = await hri.streamToText('openai/gpt-4o-mini', {
    messages: [
      { role: 'system', content: 'You are a concise assistant.' },
      { role: 'user', content: 'List 3 bullet points about HRI.' },
    ],
    stream: true,
  });
  console.log('\nStreaming aggregated:');
  console.log(text);

  // Optional: Try Groq with OpenAI OSS model (if GROQ_API_KEY is set)
  if (process.env.GROQ_API_KEY) {
    const resGroq = await hri.chat('groq/openai/gpt-oss-20b', {
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'Say hello from gpt-oss via Groq.' },
      ],
    });
    console.log('\nGroq (OpenAI OSS) response:');
    console.log(resGroq.choices[0]?.message?.content ?? '(no content)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
