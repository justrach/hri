import { HRI } from '../src/index';

async function main() {
  if (!process.env.GROQ_API_KEY) {
    console.log('Skipping: set GROQ_API_KEY to run this example.');
    return;
  }

  const hri = HRI.createDefault();

  // Groq serving OpenAI OSS model
  const res = await hri.chat('groq/openai/gpt-oss-20b', {
    messages: [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Say hello from gpt-oss via Groq.' },
    ],
  });
  console.log('\nGroq (OpenAI OSS) non-streaming:');
  console.log(res.choices[0]?.message?.content ?? '(no content)');

  const text = await hri.streamToText('groq/openai/gpt-oss-20b', {
    messages: [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Share one short tip.' },
    ],
    stream: true,
  });
  console.log('\nGroq (OpenAI OSS) streaming aggregated:');
  console.log(text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

