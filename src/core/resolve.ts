import type { ProviderId } from './types';

// Aliases for provider ids to improve DX ("smart finder")
const PROVIDER_ALIASES: Record<string, ProviderId> = {
  // openai
  openai: 'openai',
  'open-ai': 'openai',
  oai: 'openai',
  // anthropic
  anthropic: 'anthropic',
  claude: 'anthropic',
  // groq
  groq: 'groq',
  // gemini (Google)
  gemini: 'gemini',
  google: 'gemini',
  'google-ai': 'gemini',
  // openrouter
  openrouter: 'openrouter',
  'open-router': 'openrouter',
  // sambanova
  sambanova: 'sambanova',
  samba: 'sambanova',
  // cerebras
  cerebras: 'cerebras',
  'cerebras-ai': 'cerebras',
  cs: 'cerebras',
  // generic v1
  v1: 'v1',
  'openai-compatible': 'v1',
  'oai-compat': 'v1',
};

// Model prefix heuristics to infer a provider when not specified
const MODEL_PREFIX_HINTS: Array<{ test: (m: string) => boolean; provider: ProviderId }> = [
  { test: (m) => /^(gpt-|o[34](?:\b|-|_)).*/i.test(m), provider: 'openai' },
  { test: (m) => /^(claude-)/i.test(m), provider: 'anthropic' },
  { test: (m) => /^(gemini-)/i.test(m), provider: 'gemini' },
  { test: (m) => /^(llama|llama-?|meta-llama|mixtral|mistral)/i.test(m), provider: 'groq' },
];

function resolveProviderAlias(id: string | undefined): ProviderId | undefined {
  if (!id) return undefined;
  const key = id.trim().toLowerCase();
  return PROVIDER_ALIASES[key];
}

function inferProviderFromModel(model: string | undefined): ProviderId | undefined {
  if (!model) return undefined;
  const m = model.trim();
  for (const { test, provider } of MODEL_PREFIX_HINTS) {
    if (test(m)) return provider;
  }
  return undefined;
}

export type TargetLike = string | { target: string } | { provider?: string; model?: string };

export function parseTargetString(target: string): { provider?: ProviderId; model?: string } {
  const raw = target.trim();
  // Accept separators: '/', ':', or whitespace
  const parts = raw.split(/[\/:\s]+/).filter(Boolean);
  if (parts.length === 0) return {};

  // If first token looks like a provider alias, use it; otherwise treat whole as model
  const firstAsProvider = resolveProviderAlias(parts[0]);
  if (firstAsProvider) {
    const model = parts.slice(1).join('/');
    return { provider: firstAsProvider, model: model || undefined };
  }

  // No clear provider; treat as model and try to infer provider from model name
  const model = raw;
  const inferred = inferProviderFromModel(model);
  return { provider: inferred, model };
}

export function normalizeProviderModel(input: TargetLike): { provider: ProviderId; model: string } {
  // Cases:
  // 1) string like 'openai/gpt-4o-mini' or 'gpt-4o-mini'
  // 2) { target: 'openai gpt-4o-mini' }
  // 3) { provider: 'openai', model: 'gpt-4o-mini' }
  // 4) { provider: 'oai', model: 'gpt-4o-mini' } (alias)
  // 5) { model: 'gpt-4o-mini' } with inference

  let provider: ProviderId | undefined;
  let model: string | undefined;

  if (typeof input === 'string') {
    const parsed = parseTargetString(input);
    provider = parsed.provider;
    model = parsed.model;
  } else if ('target' in input && typeof input.target === 'string') {
    const parsed = parseTargetString(input.target);
    provider = parsed.provider;
    model = parsed.model;
  } else {
    // provider/model fields potentially present
    provider = resolveProviderAlias((input as any)?.provider);
    model = (input as any)?.model;

    // If provider was embedded like 'openai/gpt-4o-mini' in provider field
    if ((!model || !provider) && typeof (input as any)?.provider === 'string' && (input as any).provider.includes('/')) {
      const parsed = parseTargetString((input as any).provider);
      provider = provider ?? parsed.provider;
      model = model ?? parsed.model;
    }

    // If model field contains combined form 'openai/xxx'
    if (typeof model === 'string' && model.includes('/')) {
      const parsed = parseTargetString(model);
      provider = provider ?? parsed.provider;
      // When model contains provider/model, prefer the trailing actual model as model
      if (parsed.model) model = parsed.model;
    }

    // If provider still missing, try inferring from model
    if (!provider && typeof model === 'string') {
      provider = inferProviderFromModel(model);
    }
  }

  if (!provider || !model) {
    const hint = `Accepts 'provider/model' (e.g. 'openai/gpt-4o-mini') or separate { provider, model }.`;
    throw new Error(
      `Could not resolve provider/model from input. ${hint}`
    );
  }

  return { provider, model };
}
