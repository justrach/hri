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
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { GroqProvider } from './providers/groq';
import { OpenRouterProvider } from './providers/openrouter';
import { SambaNovaProvider } from './providers/sambanova';
import { GeminiProvider } from './providers/gemini';

export * from './core/types';
export { validateChatRequest } from './core/validation';
export { ProviderRegistry } from './core/registry';
export { OpenAIProvider } from './providers/openai';
export { AnthropicProvider } from './providers/anthropic';
export { GroqProvider } from './providers/groq';
export { OpenRouterProvider } from './providers/openrouter';
export { SambaNovaProvider } from './providers/sambanova';
export { GeminiProvider } from './providers/gemini';

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
        default:
          return this.config.proxy;
      }
    }
    return defaultBase(provider);
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const v = validateChatRequest(req);
    const provider = this.registry.get(v.provider as ProviderId);
    if (!provider) throw new Error(`Provider not registered: ${v.provider}`);
    const key = this.apiKeyFor(provider.id);
    const base = this.baseUrlFor(provider.id);
    return provider.chat({ ...v, stream: false }, key, base);
  }

  streamChat(req: ChatRequest): AsyncIterable<ChatStreamChunk> {
    const v = validateChatRequest({ ...req, stream: true });
    const provider = this.registry.get(v.provider as ProviderId);
    if (!provider || !provider.streamChat) {
      throw new Error(`Provider does not support streaming: ${v.provider}`);
    }
    const key = this.apiKeyFor(provider.id);
    const base = this.baseUrlFor(provider.id);
    return provider.streamChat(v, key, base);
  }

  // Helper: aggregate streamed content to a single string
  async streamToText(req: ChatRequest): Promise<string> {
    let text = '';
    for await (const c of this.streamChat({ ...req, stream: true })) {
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
          out = await handler(args);
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
          out = await handler(args);
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
}
