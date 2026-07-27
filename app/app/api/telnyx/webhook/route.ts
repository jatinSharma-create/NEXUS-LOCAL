import { handleTelnyxWebhookRequest } from '@/lib/telnyx-webhook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Alias kept for existing Telnyx portal configs pointing at /api/telnyx/webhook. */
export async function POST(request: Request) {
  return handleTelnyxWebhookRequest(request);
}
