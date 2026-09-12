import { Worker, Job } from 'bullmq';
import { bullmqConnection, type CallProcessingJobData } from '../lib/queue';
import { callsRepo, candidatesRepo } from '../modules/data';
import { getTranscriptionProvider } from '../modules/transcription';
import { summarizeCall } from '../modules/intelligence';
import { generateCallTranscriptPdf } from '../modules/documents';
import { uploadFile } from '../modules/storage';
import { resolveRecording } from '../modules/voice';

type AudioDownload = { buffer: Buffer; mimeType: string; filename: string };

/**
 * Ask the voice module where the audio actually lives, then fetch it.
 *
 * Presigned download URLs must NOT carry an Authorization header — adding one
 * breaks the signature — so any credentials the provider needs come back as
 * explicit headers instead.
 */
async function downloadAudio(
  recordingUrl: string,
  providerRecordingId?: string | null,
  provider?: string | null
): Promise<AudioDownload> {
  const resolved = await resolveRecording(provider ?? null, {
    recordingId: providerRecordingId,
    url: recordingUrl,
  });

  const response = await fetch(resolved.url, { headers: resolved.headers });
  if (!response.ok) {
    throw new Error(`Failed to download recording from ${resolved.url}: status ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || 'audio/mpeg';
  const mimeType =
    contentType.includes('wav') || resolved.url.includes('.wav') ? 'audio/wav' : 'audio/mpeg';
  const extension = mimeType === 'audio/wav' ? 'wav' : 'mp3';

  return { buffer, mimeType, filename: `call_recording.${extension}` };
}

export async function processCallJob(job: Job<CallProcessingJobData>) {
  const { callId, recordingUrl, candidateId, providerRecordingId, provider } = job.data;
  const currentAttempt = job.attemptsMade + 1;
  const maxAttempts = job.opts?.attempts ?? 3;
  console.log(
    `[Worker] Processing call job ${job.id} (attempt ${currentAttempt}/${maxAttempts}) for callId: ${callId}`
  );

  if (!recordingUrl) {
    console.warn(`[Worker] Job ${job.id} skipped: No recordingUrl provided`);
    return;
  }

  // ── Step 1: Download audio ──────────────────────────────────────────────────
  console.log(`[Worker] Downloading audio for callId: ${callId}...`);
  const audioInput = await downloadAudio(recordingUrl, providerRecordingId, provider);

  // ── Step 2: Transcribe ──────────────────────────────────────────────────────
  const transcriber = getTranscriptionProvider();
  console.log(`[Worker] Transcribing with provider '${transcriber.name}'...`);
  const transcribeResult = await transcriber.transcribe(audioInput);
  console.log(`[Worker] Transcription complete (${transcribeResult.text.length} chars)`);

  // ── Step 3: Summarize ───────────────────────────────────────────────────────
  console.log(`[Worker] Summarizing transcript...`);
  const summaryResult = await summarizeCall(transcribeResult.text);

  const keyPointsPayload = {
    key_points: summaryResult.key_points,
    next_steps: summaryResult.next_steps,
    sentiment: summaryResult.sentiment,
  };

  // ── Step 4: Persist transcript + summary (on success) ──────────────────────
  if (callId) {
    await callsRepo.saveTranscriptAndSummary(callId, {
      transcript: transcribeResult.text,
      summary: summaryResult.summary,
      keyPoints: keyPointsPayload,
    });
  }

  if (candidateId) {
    await candidatesRepo.setLastCallSummary(candidateId, summaryResult.summary);
  }

  console.log(`[Worker] DB updated with transcript + summary for call ${callId}`);

  // ── Step 5: Generate PDF and upload to object storage ───────────────────────
  // Throw on failure so BullMQ retries (summary is already saved; PDF is idempotent).
  if (!callId) {
    throw new Error('Cannot generate PDF: missing callId on job');
  }
  if (!transcribeResult.text?.trim()) {
    throw new Error(`Cannot generate PDF: empty transcript for call ${callId}`);
  }

  const callData = await callsRepo.loadCallWithCandidate(callId);
  if (!callData) {
    throw new Error(`Cannot generate PDF: could not load call ${callId} from DB`);
  }

  const callDate = callData.started_at
    ? new Date(callData.started_at).toLocaleString('en-AU', { timeZone: 'UTC' })
    : new Date(callData.created_at).toLocaleString('en-AU', { timeZone: 'UTC' });

  console.log(`[Worker] Generating PDF for call ${callId}...`);
  const pdfBuffer = await generateCallTranscriptPdf({
    candidateName: callData.candidate_name ?? 'Unknown Candidate',
    candidatePhone: callData.candidate_phone,
    callDate,
    durationSeconds: callData.duration_seconds,
    direction: callData.direction,
    summary: summaryResult.summary,
    keyPoints: summaryResult.key_points,
    nextSteps: summaryResult.next_steps,
    sentiment: summaryResult.sentiment,
    transcript: transcribeResult.text,
  });

  const pdfKey = `transcripts/${callId}.pdf`;
  await uploadFile(pdfBuffer, pdfKey, 'application/pdf');
  await callsRepo.attachTranscriptPdf(callId, pdfKey);

  console.log(`[Worker] PDF uploaded to object storage at key: ${pdfKey}`);
  console.log(`[Worker] Successfully processed call ${callId} for candidate ${candidateId}`);
}

const worker = new Worker<CallProcessingJobData>(
  'call-processing',
  async (job) => {
    await processCallJob(job);
  },
  {
    connection: bullmqConnection,
  }
);

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed successfully`);
});

worker.on('failed', async (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed with error:`, err);
  if (job) {
    const maxAttempts = job.opts?.attempts ?? 3;
    const isFinalAttempt = job.attemptsMade >= maxAttempts;
    console.warn(
      `[Worker] Job ${job.id} failed (attempt ${job.attemptsMade}/${maxAttempts}).${
        isFinalAttempt ? ' Exhausted all retry attempts.' : ' Scheduled for retry.'
      }`
    );

    if (isFinalAttempt) {
      const { callId } = job.data;
      if (callId) {
        try {
          await callsRepo.markFailedNeedsReview(callId);
          console.warn(`[Worker] Call ${callId} status updated to 'failed_needs_review'`);
        } catch (dbErr) {
          console.error(
            `[Worker] Failed to update call ${callId} status to 'failed_needs_review':`,
            dbErr
          );
        }
      }
    }
  }
});

console.log('[Worker] Call processing worker started and waiting for jobs...');
