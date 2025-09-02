import { HRI } from '../src/index';
import readline from 'node:readline';

async function main() {
  const hri = HRI.createDefault();

  const ctrl = new AbortController();

  // Optional: cancel automatically after N ms
  const AUTO_MS = Number(process.env.CANCEL_AFTER_MS || 0);
  const autoTimer = AUTO_MS > 0 ? setTimeout(() => ctrl.abort(), AUTO_MS) : null;

  // Optional: allow pressing Enter to stop
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('Streaming... Press Enter to stop.');
  const onLine = () => ctrl.abort();
  rl.once('line', onLine);

  const startedAt = Date.now();
  let aborted = false;
  let chunks = 0;
  let chars = 0;

  try {
    for await (const c of hri.streamChat('openai/gpt-4o-mini', {
      messages: [
        { role: 'system', content: 'You are a concise assistant.' },
        { role: 'user', content: 'Write a very long response so I can cancel midway.' },
      ],
      // Pass the signal to enable cancellation
      signal: ctrl.signal,
    })) {
      const delta = c.delta?.content ?? '';
      if (delta) {
        chunks += 1;
        chars += delta.length;
        process.stdout.write(delta);
      }
    }
    console.log('\n\n[stream finished normally]');
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      aborted = true;
      console.log('\n\n[stream aborted by user]');
    } else {
      throw e;
    }
  } finally {
    if (autoTimer) clearTimeout(autoTimer);
    rl.off('line', onLine);
    rl.close();

    const elapsedMs = Date.now() - startedAt;
    const estTokens = Math.ceil(chars / 4); // rough heuristic: ~4 chars/token in English
    console.log('\nStats:');
    console.log(`- Aborted: ${aborted}`);
    console.log(`- Chunks: ${chunks}`);
    console.log(`- Characters received: ${chars}`);
    console.log(`- Estimated completion tokens: ~${estTokens}`);
    console.log(`- Elapsed: ${elapsedMs} ms`);
    console.log('\nNote: Prompt tokens are always billed; when aborting a stream, most providers bill only the tokens generated up to cancellation. Usage metrics typically are not returned on aborted streams.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
