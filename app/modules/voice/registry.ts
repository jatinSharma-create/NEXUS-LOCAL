import { createRegistry } from '@/modules/shared/registry';
import { getVoiceProviderName, getWebhookUrl } from './core/config';
import type { VoiceProvider, VoiceRuntime } from './core/ports';
import { createSessionStore } from './infra/session-store';
import { TelnyxVoiceProvider } from './providers/telnyx';
import { FakeVoiceProvider } from './providers/fake';

/**
 * The provider registry.
 *
 * Adding a telephony vendor: create `providers/<name>/`, implement
 * `VoiceProvider`, and add one `register()` line here. No other file in the
 * codebase changes, and no shared code learns the vendor's name.
 */
const registry = createRegistry<VoiceProvider>('voice');

function runtimeFor(name: string): VoiceRuntime {
  return {
    sessions: createSessionStore(name),
    webhookUrl: () => getWebhookUrl(name),
  };
}

registry.register('telnyx', () => new TelnyxVoiceProvider(runtimeFor('telnyx')));
registry.register('fake', () => new FakeVoiceProvider(runtimeFor('fake')));

/** Resolve the active provider, or a named one when acting on a stored call. */
export function getVoiceProvider(name?: string): VoiceProvider {
  return registry.resolve(name || getVoiceProviderName());
}

export const availableVoiceProviders = registry.names;
