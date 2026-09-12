/**
 * Browser entry point for the voice module.
 *
 * UI imports only from here. No vendor SDK is referenced above this line —
 * `factory.ts` resolves one at runtime based on what the server reports.
 */
export { useVoiceSession, formatCallDuration } from './useVoiceSession';
export { createBrowserVoiceClient } from './factory';
export type {
  BrowserVoiceClient,
  VoiceClientCredentials,
  VoiceClientHandlers,
} from './types';
export type { StartCallPayload, VoiceSessionState } from './useVoiceSession';
