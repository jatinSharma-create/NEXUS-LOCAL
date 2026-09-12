import { createRegistry } from '@/modules/shared/registry';
import type { IntelligenceProvider } from './core/ports';
import { GoogleIntelligenceProvider } from './providers/google';
import type { CallSummary, ParsedResume } from '@/lib/schemas';

const registry = createRegistry<IntelligenceProvider>('intelligence');

registry.register('google', () => new GoogleIntelligenceProvider());

/**
 * Selected by LLM_PROVIDER. The Vercel AI SDK already abstracts several
 * vendors, so an OpenAI or Anthropic provider is a near-copy of the Google one
 * with a different model function.
 */
export function getIntelligenceProvider(): IntelligenceProvider {
  return registry.resolve(process.env.LLM_PROVIDER || 'google');
}

export function parseResume(text: string): Promise<ParsedResume> {
  return getIntelligenceProvider().parseResume(text);
}

export function summarizeCall(transcript: string): Promise<CallSummary> {
  return getIntelligenceProvider().summarizeCall(transcript);
}

export type { IntelligenceProvider } from './core/ports';
export const availableIntelligenceProviders = registry.names;
