// Optional adapter: map HRI TelemetryHooks to OpenTelemetry API
// This file is NOT bundled; consumers can copy/use it if they already have @opentelemetry/api.

// @ts-nocheck
import { SpanStatusCode, context, trace } from '@opentelemetry/api';
import type { TelemetryHooks } from '../src/core/types';

export function makeOtelTelemetry(tracerName = 'hri'): TelemetryHooks {
  const tracer = trace.getTracer(tracerName);
  return {
    requestStart(info) {
      const span = tracer.startSpan('hri.request', {
        attributes: {
          'hri.provider': info.provider,
          'hri.model': info.model,
          'http.request.method': info.method || 'POST',
          'url.full': info.url,
          'hri.stream': !!info.stream,
          'hri.request_id': info.requestId,
        },
      });
      const start = Date.now();
      return {
        end(extra) {
          if (extra) {
            span.setAttributes({
              'http.response.status_code': extra.status ?? 0,
              'hri.ok': !!extra.ok,
              'hri.size_bytes': extra.sizeBytes ?? 0,
              'hri.duration_ms': extra.durationMs ?? Date.now() - start,
            } as any);
            if (extra.status && extra.status >= 400) span.setStatus({ code: SpanStatusCode.ERROR });
          }
          span.end();
        },
        recordError(err) {
          span.recordException(err as any);
          span.setStatus({ code: SpanStatusCode.ERROR });
        },
      };
    },
    streamStart(info) {
      const span = tracer.startSpan('hri.stream', {
        attributes: {
          'hri.provider': info.provider,
          'hri.model': info.model,
          'hri.request_id': info.requestId,
        },
      });
      const start = Date.now();
      let chunks = 0;
      return {
        firstByte() {
          const ms = Date.now() - start;
          span.setAttribute('hri.stream.first_byte_ms', ms);
        },
        chunk(n = 1) {
          chunks += n;
        },
        end(extra) {
          span.setAttributes({
            'hri.stream.chunk_count': extra?.chunkCount ?? chunks,
            'hri.stream.completed': extra?.completed ?? true,
            'hri.duration_ms': extra?.durationMs ?? Date.now() - start,
          } as any);
          span.end();
        },
      };
    },
    toolStart(info) {
      const span = tracer.startSpan('hri.tool', {
        attributes: {
          'hri.tool.name': info.name,
          'hri.request_id': info.requestId,
        },
      });
      const start = Date.now();
      return {
        end(extra) {
          span.setAttribute('hri.tool.duration_ms', extra?.durationMs ?? Date.now() - start);
          span.end();
        },
        recordError(err) {
          span.recordException(err as any);
          span.setStatus({ code: SpanStatusCode.ERROR });
        },
      };
    },
  };
}
