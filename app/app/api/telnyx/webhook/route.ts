import { handleVoiceWebhook } from '@/modules/voice';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Legacy alias for portal configs pointing at /api/telnyx/webhook. */
export async function POST(request: Request) {
  return handleVoiceWebhook('telnyx', request);
}
