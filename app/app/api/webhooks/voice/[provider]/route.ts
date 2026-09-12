import { handleVoiceWebhook } from '@/modules/voice';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Canonical webhook path for every telephony provider. */
export async function POST(request: Request, { params }: { params: { provider: string } }) {
  return handleVoiceWebhook(params.provider, request);
}
