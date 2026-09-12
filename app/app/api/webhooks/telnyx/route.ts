import { handleVoiceWebhook } from '@/modules/voice';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Legacy path, kept so existing Telnyx Mission Control configuration keeps
 * working. New setups should point at /api/webhooks/voice/telnyx.
 */
export async function POST(request: Request) {
  return handleVoiceWebhook('telnyx', request);
}
