const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Trim and validate email shape; preserve casing exactly as provided. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const email = String(raw).trim();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/**
 * Pull the first email from resume text with its original casing.
 * Prefer this over LLM output — models often Title-Case initials.
 */
export function extractEmailFromText(text: string): string | null {
  const match = text.match(EMAIL_IN_TEXT);
  if (!match?.[0]) return null;
  return normalizeEmail(match[0]);
}

/**
 * Prefer the email as it appears in the resume body.
 * If the LLM invents different casing for the same address, keep the resume's version.
 */
export function resolveResumeEmail(
  resumeText: string,
  llmEmail: string | null | undefined
): string | null {
  const fromText = extractEmailFromText(resumeText);
  const fromLlm = normalizeEmail(llmEmail);

  if (fromText && fromLlm && fromText.toLowerCase() === fromLlm.toLowerCase()) {
    return fromText;
  }
  if (fromText) return fromText;
  return fromLlm;
}
