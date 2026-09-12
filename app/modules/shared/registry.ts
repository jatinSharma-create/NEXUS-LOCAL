import { ProviderNotRegisteredError } from './errors';

export interface NamedProvider {
  readonly name: string;
}

/**
 * A tiny provider registry, used identically by every capability module.
 *
 * Adding a vendor is one `register()` call — no factory grows a branch per
 * provider, and no shared code learns a vendor's name.
 */
export function createRegistry<T extends NamedProvider>(capability: string) {
  const factories = new Map<string, () => T>();
  const instances = new Map<string, T>();

  return {
    register(name: string, factory: () => T): void {
      factories.set(name.toLowerCase(), factory);
    },

    /** Resolve by name, constructing at most one instance per provider. */
    resolve(name: string): T {
      const key = name.toLowerCase();
      const cached = instances.get(key);
      if (cached) return cached;

      const factory = factories.get(key);
      if (!factory) {
        throw new ProviderNotRegisteredError(capability, name, Array.from(factories.keys()));
      }

      const instance = factory();
      instances.set(key, instance);
      return instance;
    },

    has(name: string): boolean {
      return factories.has(name.toLowerCase());
    },

    names(): string[] {
      return Array.from(factories.keys());
    },
  };
}
