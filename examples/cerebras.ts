import { HRI } from '../src/index';

async function main() {
  if (!process.env.CEREBRAS_API_KEY) {
    console.log('Skipping: set CEREBRAS_API_KEY to run this example.');
    return;
  }

  const hri = HRI.createDefault();

  // Basic non-streaming with multi-segment model path
  const res = await hri.chat('cerebras/openai/gpt-oss-20b', {
    messages: [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Say hello from gpt-oss via Cerebras.' },
    ],
  });
  console.log('\nCerebras non-streaming:');
  console.log(res.choices[0]?.message?.content ?? '(no content)');

  // Streaming example aggregated to text
  const text = await hri.streamToText('cerebras/openai/gpt-oss-20b', {
    messages: [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Share one fun fact.' },
    ],
    stream: true,
  });
  console.log('\nCerebras streaming aggregated:');
  console.log(text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

