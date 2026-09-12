import { getCompanyName } from './config';

/**
 * Everything the candidate hears. Provider-neutral by construction: these are
 * strings, and each adapter decides how to voice them.
 */

/** Consent IVR announcement — override with IVR_CONSENT_ANNOUNCEMENT in .env. */
export function consentAnnouncement(): string {
  return (
    process.env.IVR_CONSENT_ANNOUNCEMENT ||
    `Hello. This call is from a recruiter at ${getCompanyName()}. We may use this call for training purposes. Press 1 to consent to recording, or press 2 to continue without recording.`
  );
}

export const SCRIPT_NO_INPUT = 'We did not receive your response. This call will now end. Goodbye.';

export const RECORDING_DECLINED_NOTE =
  'Candidate did not consent for this call to be recorded.';

export function screeningIdentification(): string {
  return `This is a recruiter from ${getCompanyName()}. Please accept the call.`;
}

export const SCRIPT_NO_AGENT_CONFIGURED =
  'Consent received, but no recruiter endpoint is configured. Goodbye.';

export const CONSENT_MESSAGES = {
  granted: {
    inbound: 'Thank you. Your recruiter will return your call shortly. Goodbye.',
    connecting: 'Connecting you now.',
  },
  declined: {
    inbound:
      'Understood. Continuing without recording. Your recruiter will return your call shortly. Goodbye.',
    connecting: 'Understood. Continuing without recording. Connecting you now.',
  },
} as const;
