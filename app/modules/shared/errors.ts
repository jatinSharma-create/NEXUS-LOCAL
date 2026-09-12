/** A provider name was requested that nothing registered under. */
export class ProviderNotRegisteredError extends Error {
  constructor(capability: string, requested: string, available: string[]) {
    super(
      `No ${capability} provider registered as '${requested}'. ` +
        `Available: ${available.length ? available.join(', ') : 'none'}.`
    );
    this.name = 'ProviderNotRegisteredError';
  }
}

/** The active provider is registered but missing required configuration. */
export class ProviderConfigError extends Error {
  constructor(provider: string, missing: string[]) {
    super(`Provider '${provider}' is missing configuration: ${missing.join(', ')}`);
    this.name = 'ProviderConfigError';
  }
}

/**
 * The active provider cannot do something the caller asked for.
 *
 * Thrown loudly rather than failing silently mid-call, so a capability gap
 * shows up at the boundary instead of as a candidate listening to silence.
 */
export class NotSupportedError extends Error {
  constructor(provider: string, capability: string) {
    super(`Provider '${provider}' does not support ${capability}.`);
    this.name = 'NotSupportedError';
  }
}
