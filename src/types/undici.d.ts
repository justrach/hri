declare module 'undici' {
  // Minimal type surface we use; keep it permissive
  export class Pool {
    constructor(origin: string, opts?: any);
  }
}

