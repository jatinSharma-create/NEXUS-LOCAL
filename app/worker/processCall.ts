import { Worker, Job } from 'bullmq';
import { bullmqConnection, type CallProcessingJobData } from '../lib/queue';
import { query } from '../lib/db';
import { getSttProvider } from '../lib/stt';
import { summarizeCall } from '../lib/llm';
import { generateCallPdfBuffer } from '../lib/pdf';
import { uploadFile } from '../lib/storage';

type AudioDownload = { buffer: Buffer; mimeType: string; filename: string };

async function fetchAudioBuffer(url: string): Promise<Response> {
  // Presigned S3 / Telnyx download URLs must NOT include Authorization —
  // adding a Bearer token breaks the AWS signature (HTTP 400).
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download recording from ${url}: status ${response.status}`);
  }
  return response;
}

/**
 * Resolve a downloadable audio URL, then fetch bytes.
 * Telnyx: GET /v2/recordings/{id} → data.download_urls.mp3|wav (presigned; no auth on GET)
 */
async function downloadAudio(
  recordingUrl: string,
  telnyxRecordingId?: string | null
): Promise<AudioDownload> {
  const apiKey = process.env.TELNYX_API_KEY;
  let audioUrl = recordingUrl;

  if (telnyxRecordingId && apiKey) {
    try {
      const metaRes = await fetch(`https://api.telnyx.com/v2/recordings/${telnyxRecordingId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (metaRes.ok) {
        const body = (await metaRes.json()) as {
          data?: { download_urls?: { mp3?: string; wav?: string } };
        };
        const urls = body.data?.download_urls;
        const resolved = urls?.mp3 || urls?.wav;
        if (resolved) {
          audioUrl = resolved;
        }
      } else {
        console.warn(
          `[Worker] Telnyx recording meta ${telnyxRecordingId} returned ${metaRes.status}; using webhook URL`
        );
      }
    } catch (err) {
      console.warn(
        `[Worker] Failed to resolve Telnyx recording ${telnyxRecordingId}; using webhook URL`,
        err
      );
    }
  }

  const response = await fetchAudioBuffer(audioUrl);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get('content-type') || 'audio/mpeg';
  const mimeType = contentType.includes('wav') || audioUrl.includes('.wav') ? 'audio/wav' : 'audio/mpeg';
  const extension = mimeType === 'audio/wav' ? 'wav' : 'mp3';

  return {
    buffer,
    mimeType,
    filename: `call_recording.${extension}`,
  };
}

type CallWithCandidate = {
  call_id: string;
  direction: string;
  duration_seconds: number | null;
  started_at: Date | null;
  created_at: Date;
  candidate_id: string | null;
  candidate_name: string | null;
  candidate_phone: string | null;
};

async function loadCallWithCandidate(callId: string): Promise<CallWithCandidate | null> {
  const result = await query<CallWithCandidate>(
    `SELECT
       c.id AS call_id,
       c.direction,
       c.duration_seconds,
       c.started_at,
       c.created_at,
       c.candidate_id,
       cand.name AS candidate_name,
       cand.phone AS candidate_phone
     FROM calls c
     LEFT JOIN candidates cand ON cand.id = c.candidate_id
     WHERE c.id = $1`,
    [callId]
  );
  return result.rows[0] ?? null;
}

export async function processCallJob(job: Job<CallProcessingJobData>) {
  const { callId, recordingUrl, candidateId, telnyxRecordingId } = job.data;
  const currentAttempt = job.attemptsMade + 1;
  const maxAttempts = job.opts?.attempts ?? 3;
  console.log(`[Worker] Processing call job ${job.id} (attempt ${currentAttempt}/${maxAttempts}) for callId: ${callId}`);

  if (!recordingUrl) {
    console.warn(`[Worker] Job ${job.id} skipped: No recordingUrl provided`);
    return;
  }

  // ── Step 1: Download audio ──────────────────────────────────────────────────
  console.log(`[Worker] Downloading audio for callId: ${callId}...`);
  const audioInput = await downloadAudio(recordingUrl, telnyxRecordingId);

  // ── Step 2: Transcribe ──────────────────────────────────────────────────────
  const sttProvider = getSttProvider();
  console.log(`[Worker] Transcribing with provider '${sttProvider.name}'...`);
  const transcribeResult = await sttProvider.transcribe(audioInput);
  console.log(`[Worker] Transcription complete (${transcribeResult.text.length} chars)`);

  // ── Step 3: Summarize ───────────────────────────────────────────────────────
  console.log(`[Worker] Summarizing transcript with Gemini...`);
  const summaryResult = await summarizeCall(transcribeResult.text);

  const keyPointsPayload = {
    key_points: summaryResult.key_points,
    next_steps: summaryResult.next_steps,
    sentiment: summaryResult.sentiment,
  };

  // ── Step 4: Persist transcript + summary (on success) ──────────────────────
  if (callId) {
    await query(
      `UPDATE calls
       SET transcript_text = $1,
           summary_text    = $2,
           key_points      = $3::jsonb
       WHERE id = $4`,
      [transcribeResult.text, summaryResult.summary, JSON.stringify(keyPointsPayload), callId]
    );
  }

  if (candidateId) {
    await query(
      `UPDATE candidates
       SET last_call_summary = $1,
           updated_at        = NOW()
       WHERE id = $2`,
      [summaryResult.summary, candidateId]
    );
  }

  console.log(`[Worker] DB updated with transcript + summary for call ${callId}`);

  // ── Step 5: Generate PDF and upload to MinIO ────────────────────────────────
  // Throw on failure so BullMQ retries (summary is already saved; PDF is idempotent).
  if (!callId) {
    throw new Error('Cannot generate PDF: missing callId on job');
  }
  if (!transcribeResult.text?.trim()) {
    throw new Error(`Cannot generate PDF: empty transcript for call ${callId}`);
  }

  const callData = await loadCallWithCandidate(callId);
  if (!callData) {
    throw new Error(`Cannot generate PDF: could not load call ${callId} from DB`);
  }

  const callDate = callData.started_at
    ? new Date(callData.started_at).toLocaleString('en-AU', { timeZone: 'UTC' })
    : new Date(callData.created_at).toLocaleString('en-AU', { timeZone: 'UTC' });

  console.log(`[Worker] Generating PDF for call ${callId}...`);
  const pdfBuffer = await generateCallPdfBuffer({
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

  await query(
    `UPDATE calls SET transcript_pdf_url = $1 WHERE id = $2`,
    [pdfKey, callId]
  );

  console.log(`[Worker] PDF uploaded to MinIO at key: ${pdfKey}`);
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
          await query(
            `UPDATE calls SET status = 'failed_needs_review' WHERE id = $1`,
            [callId]
          );
          console.warn(`[Worker] Call ${callId} status updated to 'failed_needs_review'`);
        } catch (dbErr) {
          console.error(`[Worker] Failed to update call ${callId} status to 'failed_needs_review':`, dbErr);
        }
      }
    }
  }
});

console.log('[Worker] Call processing worker started and waiting for jobs...');
