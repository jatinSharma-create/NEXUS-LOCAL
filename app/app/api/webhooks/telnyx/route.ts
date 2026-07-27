import { handleTelnyxWebhookRequest } from '@/lib/telnyx-webhook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Canonical Day 4 webhook path from the engineering plan. */
export async function POST(request: Request) {
  return handleTelnyxWebhookRequest(request);
}
