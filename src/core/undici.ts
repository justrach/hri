// Node-only undici dispatcher helper
// Creates a per-origin Pool to maximize connection reuse in Node runtimes.

let pools: Map<string, any> | undefined;

function isNode(): boolean {
  try {
    // eslint-disable-next-line no-undef
    const p: any = typeof process !== 'undefined' ? process : undefined;
    // Ensure we're on Node but NOT on Bun
    return !!p?.versions?.node && !p?.versions?.bun;
  } catch {
    return false;
  }
}

function originFrom(url: string): string | undefined {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return undefined;
  }
}

export async function getUndiciDispatcher(url: string): Promise<any | undefined> {
  if (!isNode()) return undefined;
  // Opt-out via env in Node (default is to try undici if available)
  try {
    // eslint-disable-next-line no-undef
    const disable = (typeof process !== 'undefined' && (process as any).env?.HRI_USE_UNDICI) === '0';
    if (disable) return undefined;
  } catch {
    // ignore env read errors
  }

  const origin = originFrom(url);
  if (!origin) return undefined;
  try {
    const undici = await import('undici');
    const { Pool } = undici as any;
    if (!pools) pools = new Map<string, any>();
    let pool = pools.get(origin);
    if (!pool) {
      pool = new Pool(origin, {
        connections: 8,
        pipelining: 1,
        keepAliveTimeout: 10_000,
        keepAliveMaxTimeout: 60_000,
      });
      pools.set(origin, pool);
    }
    return pool;
  } catch {
    // undici not available; silently skip
    return undefined;
  }
}

