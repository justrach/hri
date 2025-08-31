// Node-only optional undici dispatcher helper
// Creates a per-origin Pool to maximize connection reuse in Node runtimes.

let pools: Map<string, any> | undefined;

function isNode(): boolean {
  try {
    // eslint-disable-next-line no-undef
    return typeof process !== 'undefined' && !!(process as any).versions?.node;
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
  // Opt-in via env to avoid surprises in Bun/browsers
  try {
    // eslint-disable-next-line no-undef
    const use = (typeof process !== 'undefined' && (process as any).env?.HRI_USE_UNDICI) === '1';
    if (!use) return undefined;
  } catch {
    return undefined;
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

