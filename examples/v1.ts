import { HRI } from '../src/index';

async function main() {
  const base = process.env.V1_BASE_URL || 'http://localhost:8000/v1';
  const key = process.env.V1_API_KEY || '';

  const hri = HRI.createDefault({
    baseUrls: { v1: base },
    apiKeys: { v1: key },
  });

  const verify = await hri.verifyModel('v1/openai/gpt-oss-20b');
  console.log('verifyModel result:', verify);

  if (!verify.exists) {
    console.log('Model not found on your endpoint. Check /models support and key permissions.');
    return;
  }

  const res = await hri.chat('v1/openai/gpt-oss-20b', {
    messages: [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Say hello from a generic v1 endpoint.' },
    ],
  });
  console.log('\nV1 non-streaming:');
  console.log(res.choices[0]?.message?.content ?? '(no content)');

  const text = await hri.streamToText('v1/openai/gpt-oss-20b', {
    messages: [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Share one fun fact.' },
    ],
    stream: true,
  });
  console.log('\nV1 streaming aggregated:');
  console.log(text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

