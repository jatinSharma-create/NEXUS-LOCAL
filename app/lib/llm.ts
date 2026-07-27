import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { ResumeParseSchema, type ParsedResume, CallSummarySchema, type CallSummary } from './schemas';
import { resolveResumeEmail } from './email';

export async function parseResume(text: string): Promise<ParsedResume> {
  const modelId = process.env.GOOGLE_GENERATIVE_AI_MODEL || 'gemini-2.5-flash-lite';
  const { object } = await generateObject({
    model: google(modelId),
    schema: ResumeParseSchema,
    temperature: 0,
    prompt: `You are an expert technical recruiter. Parse the following resume text and extract the requested fields exactly according to the schema.
If a field is missing, use null or an empty array as appropriate.

Resume Text:
${text}`,
  });

  return {
    ...object,
    // Email casing must come from the resume text — LLMs rewrite it (e.g. J…@G…).
    email: resolveResumeEmail(text, object.email),
  };
}

export async function summarizeCall(transcript: string): Promise<CallSummary> {
  const modelId = process.env.GOOGLE_GENERATIVE_AI_MODEL || 'gemini-2.5-flash-lite';
  const { object } = await generateObject({
    model: google(modelId),
    schema: CallSummarySchema,
    temperature: 0,
    prompt: `You are an executive recruiting assistant. Analyze the following transcript of a recruitment call. Provide a clear summary, key discussion points, actionable next steps, and assess the candidate sentiment.\n\nCall Transcript:\n${transcript}`,
  });

  return object;
}
