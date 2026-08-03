import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { hangupCall } from '@/lib/telnyx';

export const dynamic = 'force-dynamic';

/**
 * Hang up the PSTN (candidate) Call Control leg for a Nexus call.
 * WebRTC hangup alone often leaves the phone leg live — especially before bridge.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const callId = body.callId as string | undefined;

    if (!callId) {
      return NextResponse.json({ error: 'callId is required' }, { status: 400 });
    }

    const result = await query<{
      id: string;
      telnyx_call_control_id: string | null;
      status: string | null;
    }>(
      `SELECT id, telnyx_call_control_id, status
       FROM calls
       WHERE id = $1`,
      [callId]
    );

    const call = result.rows[0];
    if (!call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    if (call.telnyx_call_control_id) {
      try {
        await hangupCall(call.telnyx_call_control_id);
      } catch (err) {
        // Already hung up / race with remote hangup — still mark completed locally
        console.warn('[calls/hangup] Telnyx hangup (non-fatal):', err);
      }
    }

    await query(
      `UPDATE calls
       SET status = 'completed',
           hangup_cause = COALESCE(hangup_cause, 'recruiter_hangup'),
           ended_at = COALESCE(ended_at, NOW()),
           duration_seconds = COALESCE(
             duration_seconds,
             CASE
               WHEN started_at IS NOT NULL
                 THEN EXTRACT(EPOCH FROM (NOW() - started_at))::INT
               ELSE NULL
             END
           )
       WHERE id = $1
         AND status NOT IN ('completed')`,
      [callId]
    );

    return NextResponse.json({ success: true, callId });
  } catch (error) {
    console.error('Error hanging up call:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
