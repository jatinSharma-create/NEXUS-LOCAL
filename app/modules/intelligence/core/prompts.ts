/**
 * Prompts live with the capability, not with the vendor, so switching models
 * does not mean rewriting them.
 */
export const RESUME_PARSE_PROMPT = (text: string) =>
  `You are an expert technical recruiter. Parse the following resume text and extract the requested fields exactly according to the schema.
If a field is missing, use null or an empty array as appropriate.

Resume Text:
${text}`;

export const CALL_SUMMARY_PROMPT = (transcript: string) =>
  `You are an executive recruiting assistant. Analyze the following transcript of a recruitment call. Provide a clear summary, key discussion points, actionable next steps, and assess the candidate sentiment.\n\nCall Transcript:\n${transcript}`;
