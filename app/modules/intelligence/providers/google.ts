import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import {
  CallSummarySchema,
  ResumeParseSchema,
  type CallSummary,
  type ParsedResume,
} from '@/lib/schemas';
import { resolveResumeEmail } from '@/lib/email';
import type { IntelligenceProvider } from '../core/ports';
import { CALL_SUMMARY_PROMPT, RESUME_PARSE_PROMPT } from '../core/prompts';

export class GoogleIntelligenceProvider implements IntelligenceProvider {
  readonly name = 'google';

  get model(): string {
    return process.env.GOOGLE_GENERATIVE_AI_MODEL || 'gemini-2.5-flash-lite';
  }

  async parseResume(text: string): Promise<ParsedResume> {
    const { object } = await generateObject({
      model: google(this.model),
      schema: ResumeParseSchema,
      temperature: 0,
      prompt: RESUME_PARSE_PROMPT(text),
    });

    return {
      ...object,
      // Email casing must come from the resume text — LLMs rewrite it (e.g. J…@G…).
      email: resolveResumeEmail(text, object.email),
    };
  }

  async summarizeCall(transcript: string): Promise<CallSummary> {
    const { object } = await generateObject({
      model: google(this.model),
      schema: CallSummarySchema,
      temperature: 0,
      prompt: CALL_SUMMARY_PROMPT(transcript),
    });

    return object;
  }
}
