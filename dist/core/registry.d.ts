import type { Provider, ProviderId } from './types';
export declare class ProviderRegistry {
    private providers;
    register(provider: Provider): void;
    get(id: ProviderId): Provider | undefined;
    has(id: ProviderId): boolean;
}
