import { createRegistry } from '@/modules/shared/registry';
import type { TranscriptionProvider } from './core/ports';
import { GroqTranscriptionProvider } from './providers/groq';
import { GeminiTranscriptionProvider } from './providers/gemini';

const registry = createRegistry<TranscriptionProvider>('transcription');

registry.register('groq', () => new GroqTranscriptionProvider());
registry.register('gemini', () => new GeminiTranscriptionProvider());

/** Selected by STT_PROVIDER. Adding a vendor is one register() call above. */
export function getTranscriptionProvider(): TranscriptionProvider {
  return registry.resolve(process.env.STT_PROVIDER || 'groq');
}

export type {
  TranscribeInput,
  TranscribeResult,
  TranscriptionProvider,
} from './core/ports';

export const availableTranscriptionProviders = registry.names;
