import { NextResponse } from 'next/server';
import { endCall } from '@/modules/voice';

export const dynamic = 'force-dynamic';

/**
 * Hang up the candidate's phone leg for a Nexus call.
 * Hanging up in the browser alone often leaves that leg live.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const callId = body.callId as string | undefined;

    if (!callId) {
      return NextResponse.json({ error: 'callId is required' }, { status: 400 });
    }

    const { found } = await endCall(callId);
    if (!found) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, callId });
  } catch (error) {
    console.error('Error hanging up call:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
