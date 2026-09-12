import type { BrowserVoiceClient } from './types';

/**
 * Build the browser client for whichever provider the server is using.
 *
 * The provider name arrives with the credentials, so the browser never needs
 * its own copy of the configuration. Each SDK is imported dynamically, which
 * keeps unused vendors out of the bundle.
 */
export async function createBrowserVoiceClient(provider: string): Promise<BrowserVoiceClient> {
  switch (provider) {
    case 'telnyx': {
      const { TelnyxBrowserVoiceClient } = await import('../providers/telnyx/browser');
      return new TelnyxBrowserVoiceClient();
    }
    case 'fake': {
      const { FakeBrowserVoiceClient } = await import('../providers/fake/browser');
      return new FakeBrowserVoiceClient();
    }
    default:
      throw new Error(`No browser voice client available for provider '${provider}'`);
  }
}
