import { Queue, type ConnectionOptions } from 'bullmq';

/**
 * Connection options only — no Redis client at import time.
 * Avoids ENOTFOUND redis during Next.js build / static generation.
 */
export const bullmqConnection: ConnectionOptions = {
  url: process.env.REDIS_URL || 'redis://redis:6379',
  maxRetriesPerRequest: null,
};

export interface CallProcessingJobData {
  callId?: string;
  recordingUrl: string;
  candidateId?: string | null;
  telnyxRecordingId?: string | null;
}

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,
  },
  removeOnComplete: true,
};

let callProcessingQueue: Queue<CallProcessingJobData> | null = null;

/** Lazy queue singleton — created on first enqueue, not at module import. */
export function getCallProcessingQueue(): Queue<CallProcessingJobData> {
  if (!callProcessingQueue) {
    callProcessingQueue = new Queue<CallProcessingJobData>('call-processing', {
      connection: bullmqConnection,
      defaultJobOptions,
    });
  }
  return callProcessingQueue;
}
