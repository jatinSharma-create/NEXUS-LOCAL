/**
 * Data module — the single place the system talks to Postgres.
 *
 * Rules of the road:
 * - Nothing outside this directory imports `pg` or writes SQL.
 * - Everything else imports from `@/modules/data`, never a file inside it.
 *
 * Swapping the database (or putting an ORM in front of it) means rewriting the
 * repositories here and nothing else.
 */
export { query, transaction } from './client';

export * as callsRepo from './repositories/calls';
export * as candidatesRepo from './repositories/candidates';
export * as notesRepo from './repositories/notes';
export * as callSessionsRepo from './repositories/call-sessions';

export { TRASH_RETENTION_DAYS } from './repositories/candidates';

export type {
  CallDirection,
  CallLeg,
  CallRecord,
  CallStatus,
  CallWithCandidate,
  CandidateRow,
  DialTarget,
} from './types';

export type { CallSession, CallSessionState } from './repositories/call-sessions';
export type { CallDetailRow, CallListRow } from './repositories/calls';
