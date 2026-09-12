import type { NamedProvider } from '@/modules/shared/registry';
import type { CallSummary, ParsedResume } from '@/lib/schemas';

/**
 * The two language-model jobs Nexus needs. Both are defined by the Zod schemas
 * in `lib/schemas.ts` — the app states the shape it wants, and any model that
 * can produce structured output can satisfy it.
 */
export interface IntelligenceProvider extends NamedProvider {
  readonly model: string;
  parseResume(text: string): Promise<ParsedResume>;
  summarizeCall(transcript: string): Promise<CallSummary>;
}

export type { CallSummary, ParsedResume };
