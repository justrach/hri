- [ ] PRD: OpenTelemetry Integration (Optional Observability Hooks for HRI)

## Summary
- Add optional, OTEL-agnostic telemetry hooks to HRI to capture latency, reliability, streaming quality, token usage, and tool-calling behavior across providers. Provide a small adapter for `@opentelemetry/api` without making it a hard dependency.

## Motivation
- HRI spans multiple providers and transports; consistent visibility reduces MTTR and helps performance tuning and cost tracking.
- Users want drop-in tracing/metrics with minimal code changes and no vendor lock-in.

## Goals
- Non-invasive, optional integration (no hard OTEL runtime dependency).
- Trace request/stream lifecycles across providers with consistent attributes.
- Capture token usage, streaming first-byte latency, chunk counts, and tool-call loops.
- Safe-by-default redaction; opt-in body capture.

## Non-Goals
- Building or bundling an OTEL SDK/exporter.
- Persisting data or shipping dashboards (examples only).
- Deep provider-specific payload parsing beyond current HRI mapping.

## User Stories
- As a developer, I enable telemetry and get traces for every HRI request with provider/model context.
- As an SRE, I monitor error rates and p95 latency across providers/models and detect regressions.
- As a product owner, I correlate token usage and costs per feature flow.

## Requirements
### Functional
- Provide a `telemetry` interface in `ClientConfig` with lifecycle hooks:
  - requestStart → end/recordError
  - streamStart → firstByte/chunk/end
  - toolStart → end/recordError
- Instrument in `transport.http`, `transport.parseSSE`, and tool-execution paths.
- Propagate provider/model/stream flags to hooks; record `usage` via existing `onUsage` and/or a telemetry event.
- Default behavior is no-op when `telemetry` is undefined.

### Non-Functional
- No increase in bundle size for consumers who don’t use telemetry.
- Minimal overhead when hooks are no-ops (hot path friendly).
- Safe handling of errors; telemetry must not crash user flows.

## Design Overview
- Keep core OTEL-agnostic by defining a small `TelemetryHooks` interface in `src/core/types.ts`.
- Wire hooks in:
  - `src/core/transport.ts#http`: wrap fetch; record status, duration, and errors.
  - `src/core/transport.ts#parseSSE`: record time-to-first-byte, chunk counts, completion.
  - `src/index.ts#HRI.chat`/`streamChat`: pass context (provider/model/stream) into provider via internal `__telemetry`.
  - `src/index.ts#chatWithTools`/`streamWithTools`: wrap each tool handler invocation.
  - Providers (initial: `openai`, `anthropic`): pass provider/model/stream + `telemetry` to `http()` and `parseSSE()`.
  - `verifyModel`: covered via transport-level `http()` hooks when it makes HTTP calls.
- Provide an optional `examples/otelAdapter.ts` that maps hooks to `@opentelemetry/api` spans (not bundled; zero overhead by default).

## API Additions
```ts
// src/core/types.ts (or: src/core/telemetry.ts)
export interface TelemetryHooks {
  requestStart(info: {
    url: string;
    method?: string;
    provider?: ProviderId;
    model?: string;
    stream?: boolean;
    requestId?: string;
  }): {
    end(extra?: { status?: number; ok?: boolean; sizeBytes?: number; durationMs?: number }): void;
    recordError(err: unknown): void;
  };

  streamStart(info: {
    provider?: ProviderId;
    model?: string;
    requestId?: string;
  }): {
    firstByte(): void;
    chunk(count?: number): void; // default 1
    end(extra?: { chunkCount?: number; durationMs?: number; completed?: boolean }): void;
  };

  toolStart(info: { name: string; requestId?: string }): {
    end(extra?: { durationMs?: number }): void;
    recordError(err: unknown): void;
  };
}

export interface ClientConfig {
  telemetry?: TelemetryHooks;
  captureBodies?: boolean; // default: false (guard prompt/response capture)
}
```

Notes:
- `ChatRequest` includes internal-only fields `__telemetry?: TelemetryHooks` and `__requestId?: string` for propagation; not part of the public surface.

## Hook Wiring Points
- `transport.http(url, opts)`: implemented in `src/core/transport.ts` as above.
- `parseSSE(body, meta)`: implemented in `src/core/transport.ts` with `firstByte()/chunk()/end()`.
- `HRI.chat/streamChat`: implemented in `src/index.ts` by passing `__telemetry`.
- `chatWithTools/streamWithTools`: implemented in `src/index.ts` with `toolStart().end()/recordError()` around each handler.
- `verifyModel`: covered via existing `http()` hooks.

## Attributes (suggested)
- Request: `hri.provider`, `hri.model`, `http.request.method`, `url.full`, `hri.stream`, `hri.request_id`.
- Response: `http.response.status_code`, `hri.ok`, `hri.duration_ms`, `hri.size_bytes`.
- Stream: `hri.stream.first_byte_ms`, `hri.stream.chunk_count`, `hri.stream.completed`.
- Usage: `hri.usage.prompt_tokens`, `hri.usage.completion_tokens`, `hri.usage.total_tokens`.
- Tool: `hri.tool.name`, `hri.tool.duration_ms`, `exception.*` when applicable.

## OTEL Adapter (example, not bundled)
```ts
// examples/otelAdapter.ts
import { context, trace, SpanStatusCode } from '@opentelemetry/api';

export function makeOtelTelemetry(tracerName = 'hri') {
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
            });
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
      const span = tracer.startSpan('hri.stream', { attributes: { 'hri.provider': info.provider, 'hri.model': info.model, 'hri.request_id': info.requestId } });
      const start = Date.now();
      let chunks = 0;
      let firstByteAt: number | undefined;
      return {
        firstByte() { firstByteAt = Date.now(); span.setAttribute('hri.stream.first_byte_ms', firstByteAt - start); },
        chunk(n = 1) { chunks += n; },
        end(extra) {
          span.setAttributes({ 'hri.stream.chunk_count': extra?.chunkCount ?? chunks, 'hri.stream.completed': extra?.completed ?? true, 'hri.duration_ms': extra?.durationMs ?? Date.now() - start });
          span.end();
        },
      };
    },
    toolStart(info) {
      const span = tracer.startSpan('hri.tool', { attributes: { 'hri.tool.name': info.name, 'hri.request_id': info.requestId } });
      const start = Date.now();
      return {
        end(extra) { span.setAttribute('hri.tool.duration_ms', extra?.durationMs ?? Date.now() - start); span.end(); },
        recordError(err) { span.recordException(err as any); span.setStatus({ code: SpanStatusCode.ERROR }); },
      };
    },
  };
}
```

## Privacy & Safety
- Default: do not capture request/response bodies; expose `captureBodies` flag for opt-in.
- Encourage redaction of PII in user-provided adapters; document examples.
- Hooks must not throw; all telemetry is best-effort.

## Testing & Validation
- Unit: ensure no-telemetry code paths behave identically and hooks are invoked exactly once per lifecycle stage.
- E2E (example app): verify traces appear with correct attributes for both non-streaming and streaming requests, including tool-calling loops.

## Operational Metrics (suggested)
- Error rate, p50/p95/p99 latency by provider/model.
- Time-to-first-byte and chunk count distributions for streams.
- Token usage totals by provider/model and feature area.

## Rollout Plan
- Phase 1: add hooks (no-op default), examples adapter, docs.
- Phase 2: internal dogfood and adjust attributes.
- Phase 3: public release + migration notes.

## Risks & Mitigations
- Overhead: keep hooks branch-predictable; avoid extra allocations when disabled.
- Data leakage: default redaction; require explicit opt-in for bodies.
- API churn: keep hooks minimal and stable; version behind minor release.

## Open Questions
- Do we want separate spans per provider retry (if added later)?
- Should `onUsage` also emit through `telemetry` to unify sinks?
- Include request ID propagation to user space?

## Acceptance Criteria (Checklist)
- [x] `TelemetryHooks` interface shipped and documented.
- [x] `transport.http` and `parseSSE` invoke hooks appropriately.
- [x] Tool execution paths instrumented.
- [x] `ClientConfig.telemetry` optional and no-op by default.
- [x] Example OTEL adapter and snippet in `examples/`.
- [ ] Docs updated with integration guidance and privacy notes.

## Implementation Summary (Current)
- Types: `src/core/types.ts` — added `TelemetryHooks`, `ClientConfig.telemetry`, `captureBodies`, and internal `__telemetry` propagation fields.
- Transport: `src/core/transport.ts` — instrumented `http()` and `parseSSE()` with safe, no-op-by-default hooks.
- Core: `src/index.ts` — propagated telemetry; instrumented tool execution in `chatWithTools()` and `streamWithTools()`.
- Providers: `src/providers/openai.ts`, `src/providers/anthropic.ts` — pass provider/model/stream + telemetry to transport.
- Example: `examples/otelAdapter.ts` — OTEL adapter mapping hooks to spans.

