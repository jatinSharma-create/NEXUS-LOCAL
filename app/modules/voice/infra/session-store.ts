import { callSessionsRepo } from '@/modules/data';
import type { VoiceSessionStore } from '../core/ports';

/**
 * Postgres-backed leg state.
 *
 * This is the composition seam: adapters depend on the `VoiceSessionStore`
 * interface, and only this file knows the state lives in a table.
 */
export function createSessionStore(provider: string): VoiceSessionStore {
  return {
    async get(providerCallId) {
      const session = await callSessionsRepo.getSession(providerCallId);
      if (!session) return null;
      return {
        callId: session.call_id,
        leg: session.leg,
        ended: session.state?.ended === true,
        bridgeTo: session.state?.bridgeTo ?? null,
        adapter: session.state?.adapter ?? {},
      };
    },

    async upsert(input) {
      await callSessionsRepo.upsertSession({
        providerCallId: input.providerCallId,
        callId: input.callId,
        provider,
        leg: input.leg,
        state: {
          ...(input.bridgeTo ? { bridgeTo: input.bridgeTo } : {}),
          ...(input.adapter ? { adapter: input.adapter } : {}),
        },
      });
    },

    async patchAdapterState(providerCallId, patch) {
      const existing = await callSessionsRepo.getSession(providerCallId);
      await callSessionsRepo.patchSessionState(providerCallId, {
        adapter: { ...(existing?.state?.adapter ?? {}), ...patch },
      });
    },
  };
}
