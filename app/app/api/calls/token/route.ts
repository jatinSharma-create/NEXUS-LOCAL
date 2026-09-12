import { NextResponse } from 'next/server';
import { createClientCredentials, getCallerId } from '@/modules/voice';

export const dynamic = 'force-dynamic';

/**
 * Credentials for the recruiter's browser leg.
 *
 * The response names the provider so the browser can load the matching client
 * adapter — the UI never needs its own copy of the calling configuration.
 */
export async function POST() {
  try {
    const credentials = await createClientCredentials();

    return NextResponse.json({
      ...credentials,
      callerId: getCallerId() || null,
    });
  } catch (error) {
    console.error('Error generating calling credentials:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to generate calling credentials';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
