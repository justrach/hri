// Optional adapter: map HRI TelemetryHooks to Langfuse
// Not bundled. Install in your app: npm i langfuse --save
// Docs: https://langfuse.com/docs

// @ts-nocheck
import { Langfuse } from 'langfuse';
import type { TelemetryHooks } from '../src/core/types';

/**
 * Minimal Langfuse adapter.
 * - Creates a trace per requestId (if provided) or per process for simplicity.
 * - Creates spans for request, stream, and tool executions.
 * You can customize correlation (user/session IDs) as needed.
 */
export function makeLangfuseTelemetry(opts: { langfuse: Langfuse; projectId?: string } ): TelemetryHooks {
  const { langfuse } = opts;

  // naive in-memory map requestId -> trace
  const traces = new Map<string, any>();
  function getTrace(id?: string) {
    const key = id || 'default';
    let t = traces.get(key);
    if (!t) {
      t = langfuse.trace({ name: 'hri', id: key });
      traces.set(key, t);
    }
    return t;
  }

  return {
    requestStart(info) {
      const trace = getTrace(info.requestId);
      const span = trace.span({
        name: 'hri.request',
        input: { url: info.url, method: info.method, provider: info.provider, model: info.model, stream: !!info.stream },
        metadata: { 'hri.provider': info.provider, 'hri.model': info.model },
      });
      const start = Date.now();
      return {
        end(extra) {
          span.update({
            output: { status: extra?.status, ok: extra?.ok, sizeBytes: extra?.sizeBytes },
            duration: (extra?.durationMs ?? (Date.now() - start)) / 1000,
          });
          if (extra?.status && extra.status >= 400) span.end({ level: 'ERROR' }); else span.end();
        },
        recordError(err) {
          try {
            span.update({ output: { error: String(err) } });
            span.end({ level: 'ERROR' });
          } catch {}
        },
      };
    },

    streamStart(info) {
      const trace = getTrace(info.requestId);
      const span = trace.span({ name: 'hri.stream', metadata: { 'hri.provider': info.provider, 'hri.model': info.model } });
      const start = Date.now();
      let chunks = 0;
      return {
        firstByte() {
          const ms = Date.now() - start;
          span.update({ metadata: { 'hri.stream.first_byte_ms': ms } });
        },
        chunk(n = 1) {
          chunks += n;
        },
        end(extra) {
          span.update({
            metadata: {
              'hri.stream.chunk_count': extra?.chunkCount ?? chunks,
              'hri.stream.completed': extra?.completed ?? true,
            },
            duration: (extra?.durationMs ?? (Date.now() - start)) / 1000,
          });
          span.end();
        },
      };
    },

    toolStart(info) {
      const trace = getTrace(info.requestId);
      const span = trace.span({ name: 'hri.tool', metadata: { 'hri.tool.name': info.name } });
      const start = Date.now();
      return {
        end(extra) {
          span.update({ duration: (extra?.durationMs ?? (Date.now() - start)) / 1000 });
          span.end();
        },
        recordError(err) {
          try {
            span.update({ output: { error: String(err) } });
            span.end({ level: 'ERROR' });
          } catch {}
        },
      };
    },
  };
}
