import { ProviderRegistry } from './core/registry';
import type {
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  ProviderId,
  Provider,
  ClientConfig,
  ChatMessage,
} from './core/types';
import { validateChatRequest } from './core/validation';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';

export * from './core/types';
export { validateChatRequest } from './core/validation';
export { ProviderRegistry } from './core/registry';
export { OpenAIProvider } from './providers/openai';
export { AnthropicProvider } from './providers/anthropic';

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
}
