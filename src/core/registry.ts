import type { Provider, ProviderId } from './types';

export class ProviderRegistry {
  private providers = new Map<ProviderId, Provider>();

  register(provider: Provider) {
    this.providers.set(provider.id, provider);
  }

  get(id: ProviderId): Provider | undefined {
    return this.providers.get(id);
  }

  has(id: ProviderId): boolean {
    return this.providers.has(id);
  }
}
