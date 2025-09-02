import { ProviderRegistry } from './core/registry';
import type {
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  ProviderId,
  Provider,
  ClientConfig,
  ChatMessage,
  ToolDef,
  ToolCall,
} from './core/types';
import { validateChatRequest } from './core/validation';
import { normalizeProviderModel, type TargetLike } from './core/resolve';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { GroqProvider } from './providers/groq';
import { OpenRouterProvider } from './providers/openrouter';
import { SambaNovaProvider } from './providers/sambanova';
import { GeminiProvider } from './providers/gemini';
import { CerebrasProvider } from './providers/cerebras';
import { V1Provider } from './providers/v1';
import { http, joinUrl } from './core/transport';

export * from './core/types';
export { validateChatRequest } from './core/validation';
export { ProviderRegistry } from './core/registry';
export { OpenAIProvider } from './providers/openai';
export { AnthropicProvider } from './providers/anthropic';
export { GroqProvider } from './providers/groq';
export { OpenRouterProvider } from './providers/openrouter';
export { SambaNovaProvider } from './providers/sambanova';
export { GeminiProvider } from './providers/gemini';
export { CerebrasProvider } from './providers/cerebras';
export { V1Provider } from './providers/v1';

function env(name: string): string | undefined {
  try {
    // Bun/node
    // eslint-disable-next-line no-undef
    return (typeof process !== 'undefined' && process?.env?.[name]) || undefined;
  } catch {
    return undefined;
  }
}

function keyFromEnv(provider: ProviderId): string | undefined {
  const map: Record<ProviderId, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    groq: 'GROQ_API_KEY',
    gemini: 'GEMINI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    sambanova: 'SAMBANOVA_API_KEY',
    cerebras: 'CEREBRAS_API_KEY',
    v1: 'V1_API_KEY',
  };
  return env(map[provider]);
}

function defaultBase(provider: ProviderId): string | undefined {
  switch (provider) {
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'anthropic':
      return 'https://api.anthropic.com';
    default:
      return undefined;
  }
}

export class HRI {
  readonly registry: ProviderRegistry;
  private config: ClientConfig;

  constructor(config: ClientConfig = {}, registry?: ProviderRegistry) {
    this.config = config;
    this.registry = registry ?? new ProviderRegistry();
  }

  static createDefault(config: ClientConfig = {}): HRI {
    const hri = new HRI(config);
    hri.use(new OpenAIProvider());
    hri.use(new AnthropicProvider());
    hri.use(new GroqProvider());
    hri.use(new OpenRouterProvider());
    hri.use(new SambaNovaProvider());
    hri.use(new GeminiProvider());
    hri.use(new CerebrasProvider());
    hri.use(new V1Provider());
    return hri;
  }

  use(provider: Provider) {
    this.registry.register(provider);
    return this;
  }

  private apiKeyFor(provider: ProviderId): string | undefined {
    return this.config.apiKeys?.[provider] ?? keyFromEnv(provider);
  }

  private baseUrlFor(provider: ProviderId): string | undefined {
    if (this.config.baseUrls?.[provider]) return this.config.baseUrls[provider];
    if (this.config.proxy) {
      // Opinionated proxy mapping paths; user can override via baseUrls
      switch (provider) {
        case 'openai':
          return `${this.config.proxy.replace(/\/$/, '')}/openai/v1`;
        case 'anthropic':
          return `${this.config.proxy.replace(/\/$/, '')}/anthropic`;
        case 'v1':
          return `${this.config.proxy.replace(/\/$/, '')}/v1`;
        default:
          return this.config.proxy;
      }
    }
    return defaultBase(provider);
  }

  // Overloads for easier DX
  async chat(target: string, init: Omit<ChatRequest, 'provider' | 'model'>): Promise<ChatResponse>;
  async chat(req: ChatRequest): Promise<ChatResponse>;
  async chat(reqOrTarget: ChatRequest | string, init?: Omit<ChatRequest, 'provider' | 'model'>): Promise<ChatResponse> {
    const normalized = this.normalizeInput(reqOrTarget as any, init as any);
    const v = validateChatRequest(normalized);
    const provider = this.registry.get(v.provider as ProviderId);
    if (!provider) throw new Error(`Provider not registered: ${v.provider}`);
    const key = this.apiKeyFor(provider.id);
    const base = this.baseUrlFor(provider.id);
    const res = await provider.chat({ ...v, stream: false, __telemetry: this.config.telemetry }, key, base);
    try {
      this.config.onUsage?.(res.usage, { provider: provider.id, model: v.model });
    } catch {
      // user hook errors should not break flow
    }
    return res;
  }

  // Overloads for easier DX
  streamChat(target: string, init: Omit<ChatRequest, 'provider' | 'model'> & { stream?: true }): AsyncIterable<ChatStreamChunk>;
  streamChat(req: ChatRequest): AsyncIterable<ChatStreamChunk>;
  streamChat(reqOrTarget: ChatRequest | string, init?: Omit<ChatRequest, 'provider' | 'model'> & { stream?: true }): AsyncIterable<ChatStreamChunk> {
    const normalized = this.normalizeInput(reqOrTarget as any, { ...(init as any), stream: true });
    const v = validateChatRequest({ ...normalized, stream: true });
    const provider = this.registry.get(v.provider as ProviderId);
    if (!provider || !provider.streamChat) {
      throw new Error(`Provider does not support streaming: ${v.provider}`);
    }
    const key = this.apiKeyFor(provider.id);
    const base = this.baseUrlFor(provider.id);
    return provider.streamChat({ ...v, __telemetry: this.config.telemetry }, key, base);
  }

  // Helper: aggregate streamed content to a single string
  async streamToText(target: string, init: Omit<ChatRequest, 'provider' | 'model'> & { stream?: true }): Promise<string>;
  async streamToText(req: ChatRequest): Promise<string>;
  async streamToText(reqOrTarget: ChatRequest | string, init?: Omit<ChatRequest, 'provider' | 'model'> & { stream?: true }): Promise<string> {
    const normalized = this.normalizeInput(reqOrTarget as any, { ...(init as any), stream: true });
    let text = '';
    for await (const c of this.streamChat({ ...normalized, stream: true })) {
      const delta = c.delta?.content;
      if (typeof delta === 'string') text += delta;
    }
    return text;
  }

  // Automatic Function Calling (OpenAI-compatible)
  // Executes tool calls returned by the model until completion or maxCalls reached.
  async chatWithTools(
    req: ChatRequest & { tools?: ToolDef[]; tool_choice?: ChatRequest['tool_choice'] },
    handlers: Record<string, (args: any) => any | Promise<any>>,
    opts: { maxCalls?: number } = {}
  ): Promise<ChatResponse> {
    const maxCalls = opts.maxCalls ?? 10;
    const messages: ChatMessage[] = [...req.messages];
    let calls = 0;

    // Allow forcing a first tool via tool_choice, but automatically switch to 'auto' after first round
    let toolChoice = req.tool_choice;
    while (calls <= maxCalls) {
      const res = await this.chat({ ...req, messages, stream: false, tool_choice: toolChoice });
      const choice = res.choices?.[0];
      const msg = choice?.message as ChatMessage | undefined;
      const toolCalls = (msg?.tool_calls as ToolCall[] | undefined) || [];

      if (!toolCalls.length) {
        return res;
      }

      // Append the assistant message containing the tool_calls
      messages.push({ role: 'assistant', content: msg?.content || '', tool_calls: toolCalls });

      // Execute tools and push tool results as messages
      for (const tc of toolCalls) {
        if (tc.type !== 'function') continue;
        const name = tc.function?.name;
        const handler = handlers[name];
        let args: any = {};
        try {
          args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          args = {};
        }
        let out: any;
        try {
          if (!handler) throw new Error(`No handler for tool: ${name}`);
          const t = this.config.telemetry;
          const hook = t?.toolStart?.({ name });
          const start = Date.now();
          try {
            out = await handler(args);
            try { hook?.end?.({ durationMs: Date.now() - start }); } catch {}
          } catch (e) {
            try { hook?.recordError?.(e); } catch {}
            throw e;
          }
        } catch (e: any) {
          out = { error: String(e?.message || e) };
        }
        const content = typeof out === 'string' ? out : JSON.stringify(out);
        messages.push({ role: 'tool', content, tool_call_id: tc.id });
      }

      calls += 1;
      if (toolChoice === 'required' || (toolChoice && typeof toolChoice === 'object')) {
        toolChoice = 'none';
      } else {
        toolChoice = 'auto';
      }
      // Next loop will send updated messages; keep tools in request and continue.
      // Optionally, user may set tool_choice:'none' in req to force a final answer.
    }

    throw new Error(`Exceeded max tool calls (${maxCalls}) during chatWithTools()`);
  }

  // Streaming AFC (OpenAI-compatible)
  // Yields chunks as they arrive; when a tool_calls finish is reached, executes tools and continues streaming.
  async *streamWithTools(
    req: ChatRequest & { tools?: ToolDef[]; tool_choice?: ChatRequest['tool_choice'] },
    handlers: Record<string, (args: any) => any | Promise<any>>,
    opts: { maxCalls?: number } = {}
  ): AsyncIterable<ChatStreamChunk> {
    const maxCalls = opts.maxCalls ?? 10;
    const baseReq = { ...req, stream: true } as ChatRequest;
    const messages: ChatMessage[] = [...req.messages];
    let calls = 0;

    // Allow a first forced tool_choice, then revert to 'auto'
    let toolChoice = req.tool_choice;
    while (calls <= maxCalls) {
      const stream = this.streamChat({ ...baseReq, messages, tool_choice: toolChoice });
      // Accumulate tool_calls deltas by id
      const toolAccum = new Map<string, { name: string | undefined; args: string }>();
      for await (const chunk of stream) {
        // Aggregate tool call delta if present
        const deltas = chunk.delta?.tool_calls || [];
        for (const t of deltas) {
          if (!t) continue;
          const id = t.id || '0';
          const acc = toolAccum.get(id) ?? { name: t.function?.name, args: '' };
          if (t.function?.name) acc.name = t.function.name;
          if (t.function?.arguments) acc.args += t.function.arguments;
          toolAccum.set(id, acc);
        }
        yield chunk;
      }

      // If no tool calls were emitted during this streamed turn, end streaming
      if (toolAccum.size === 0) return;

      // Append assistant message with tool_calls (filter invalid entries without a function name)
      const toolCalls = Array.from(toolAccum.entries())
        .filter(([, v]) => v.name && v.name.length > 0)
        .map(([id, v]) => ({
          id,
          type: 'function' as const,
          function: { name: v.name as string, arguments: v.args || '{}' },
        }));

      // If nothing valid accumulated, end the stream gracefully
      if (toolCalls.length === 0) return;
      messages.push({ role: 'assistant', content: '', tool_calls: toolCalls });

      // Execute and append tool results
      for (const tc of toolCalls) {
        const handler = handlers[tc.function.name];
        let args: any = {};
        try {
          args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          args = {};
        }
        let out: any;
        try {
          if (!handler) throw new Error(`No handler for tool: ${tc.function.name}`);
          const t = this.config.telemetry;
          const hook = t?.toolStart?.({ name: tc.function.name });
          const start = Date.now();
          try {
            out = await handler(args);
            try { hook?.end?.({ durationMs: Date.now() - start }); } catch {}
          } catch (e) {
            try { hook?.recordError?.(e); } catch {}
            throw e;
          }
        } catch (e: any) {
          out = { error: String(e?.message || e) };
        }
        const content = typeof out === 'string' ? out : JSON.stringify(out);
        messages.push({ role: 'tool', content, tool_call_id: tc.id });
      }

      calls += 1;
      // After a tool round: if the initial choice was 'required' or a specific function,
      // force a final answer to avoid infinite tool loops; otherwise fall back to 'auto'.
      if (toolChoice === 'required' || (toolChoice && typeof toolChoice === 'object')) {
        toolChoice = 'none';
      } else {
        toolChoice = 'auto';
      }
      // Loop to continue streaming the follow-up model response
    }

    throw new Error(`Exceeded max tool calls (${maxCalls}) during streamWithTools()`);
  }

  // Verify if a model exists for a provider by querying /models when supported
  async verifyModel(target: string | ChatRequest): Promise<{ exists: boolean; provider: ProviderId; model: string; models?: string[]; status?: number; error?: string }>{
    const normalized = this.normalizeInput(target as any);
    const { provider: pid, model } = normalized;
    const provider = this.registry.get(pid);
    if (!provider) throw new Error(`Provider not registered: ${pid}`);
    const key = this.apiKeyFor(pid);
    const base = this.baseUrlFor(pid);
    // Prefer provider-implemented listModels
    try {
      if (provider.listModels) {
        const models = await provider.listModels(key, base);
        const exists = !!models?.includes(model);
        return { exists, provider: pid, model, models };
      }
    } catch (e: any) {
      return { exists: false, provider: pid, model, error: String(e?.message || e) };
    }

    // Fallback: attempt generic OpenAI v1 /models
    if (!base) return { exists: false, provider: pid, model, error: 'Base URL is not configured for provider; cannot query /models.' };
    try {
      const url = joinUrl(base, '/models');
      const headers: Record<string, string> = { 'Authorization': `Bearer ${key || ''}`, 'Accept': 'application/json' };
      const res = await http(url, { method: 'GET', headers });
      if (!res.ok) {
        const text = await res.text();
        const status = res.status;
        let hint = 'Unknown error querying /models.';
        if (status === 401) hint = 'Unauthorized: API key missing or invalid.';
        else if (status === 403) hint = 'Forbidden: key lacks permission for /models.';
        else if (status === 404) hint = 'Not found: base URL may be wrong (no /models).';
        else if (status >= 500) hint = 'Provider server error (5xx).';
        return { exists: false, provider: pid, model, status, error: `${hint} ${text}` };
      }
      const json: any = await res.json().catch(() => ({}));
      const models: string[] = Array.isArray(json?.data) ? json.data.map((m: any) => m?.id).filter(Boolean) : Array.isArray(json) ? json.filter((x) => typeof x === 'string') : [];
      const exists = !!models?.includes(model);
      return { exists, provider: pid, model, models };
    } catch (e: any) {
      const msg = String(e?.message || e);
      const corsHint = msg.includes('fetch failed') ? 'Network/CORS/proxy error while calling /models.' : '';
      return { exists: false, provider: pid, model, error: [corsHint, msg].filter(Boolean).join(' ') };
    }
  }

  // Internal: normalize various DX-friendly inputs to a strict ChatRequest
  private normalizeInput(reqOrTarget: ChatRequest | string | TargetLike, init?: PartialChatInit): ChatRequest {
    if (typeof reqOrTarget === 'string') {
      const { provider, model } = normalizeProviderModel(reqOrTarget);
      const base: any = { ...(init || {}) };
      const messages = base.messages || [];
      return { ...base, provider, model, messages } as ChatRequest;
    }
    const base: any = { ...(reqOrTarget as any), ...(init || {}) };
    const { provider, model } = normalizeProviderModel(base as any);
    const { target: _omit, ...rest } = base;
    return { ...rest, provider, model } as ChatRequest;
  }
}
// Helper type for overloads
export interface PartialChatInit extends Partial<Omit<ChatRequest, 'provider' | 'model'>> {
  provider?: string;
  model?: string;
  target?: string;
}
