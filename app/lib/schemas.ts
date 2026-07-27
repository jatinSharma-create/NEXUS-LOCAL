import { z } from 'zod';

export const ResumeParseSchema = z.object({
  name: z.string().describe("The candidate's full name"),
  email: z
    .string()
    .email()
    .nullable()
    .describe(
      "The candidate's email address, or null if not found"
    ),
  phone: z.string().describe("The candidate's phone number"),
  current_role: z.string().nullable().describe("The candidate's current or most recent job title"),
  years_experience: z.number().nullable().describe("Total years of professional experience, parsed as a number"),
  skills: z.array(z.string()).describe("A list of relevant technical or professional skills"),
  experience: z.array(
    z.object({
      company: z.string(),
      role: z.string(),
      dates: z.string(),
      summary: z.string()
    })
  ).describe("The candidate's work history"),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: z.string(),
      dates: z.string()
    })
  ).describe("The candidate's educational background")
});

export type ParsedResume = z.infer<typeof ResumeParseSchema>;

export const ParsedJsonBodySchema = ResumeParseSchema.pick({
  current_role: true,
  years_experience: true,
  skills: true,
  experience: true,
  education: true,
});

export type ParsedJsonBody = z.infer<typeof ParsedJsonBodySchema>;

export function toParsedJsonBody(parsed: ParsedResume): ParsedJsonBody {
  return {
    current_role: parsed.current_role,
    years_experience: parsed.years_experience,
    skills: parsed.skills,
    experience: parsed.experience,
    education: parsed.education,
  };
}

export const CallSummarySchema = z.object({
  summary: z.string().describe('A concise executive summary of the phone conversation'),
  key_points: z.array(z.string()).describe('Key discussion points and qualifications discussed during the call'),
  next_steps: z.array(z.string()).describe('Follow-up actions or next steps agreed upon'),
  sentiment: z.enum(['positive', 'neutral', 'negative']).describe('Overall candidate sentiment during the call'),
});

export type CallSummary = z.infer<typeof CallSummarySchema>;

