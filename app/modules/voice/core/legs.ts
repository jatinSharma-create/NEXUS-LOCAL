import type { CallLeg } from '@/modules/data';
import type { LegSession, VoiceSessionStore } from './ports';

/**
 * Working out which leg a provider call id belongs to.
 *
 * This lives in `core/` because it is not one vendor's problem. Any provider
 * that dials a second leg learns that leg's id only when its own dial request
 * returns, and carriers routinely deliver the new leg's first webhook before
 * that happens. So an unknown leg that *we* originated does not mean "unknown",
 * it means "ours, not yet recorded".
 *
 * Guessing in that window is what once labelled the recruiter's leg as the
 * candidate's and played the recording-consent IVR down it, leaving the
 * candidate on a silent line. Every provider would hit the same race, so the
 * policy is written once here rather than rediscovered per adapter.
 */

const LOOKUP_ATTEMPTS = 4;
const LOOKUP_DELAY_MS = 150;

export type LegResolution = {
  session: LegSession | null;
  leg: CallLeg;
};

export async function resolveLegSession(
  sessions: VoiceSessionStore,
  providerCallId: string,
  opts: {
    /**
     * Did we place this leg? If so, our own bookkeeping is in flight and worth
     * waiting for. Genuinely inbound calls are nobody's pending write, so they
     * resolve on the first look.
     */
    originatedByUs: boolean;
    /** Used only when the leg is still unknown after waiting. */
    fallbackLeg: CallLeg;
  }
): Promise<LegResolution> {
  const attempts = opts.originatedByUs ? LOOKUP_ATTEMPTS : 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const session = await sessions.get(providerCallId);
    if (session) {
      return { session, leg: legOf(session) };
    }
    if (attempt < attempts - 1) {
      await delay(LOOKUP_DELAY_MS);
    }
  }

  return { session: null, leg: opts.fallbackLeg };
}

/**
 * Trust recorded facts over the stored label: a leg holding a bridge target was
 * created to join someone onto an existing call, so it is the agent's however
 * it came to be labelled.
 */
export function legOf(session: LegSession): CallLeg {
  return session.bridgeTo ? 'agent' : session.leg;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
