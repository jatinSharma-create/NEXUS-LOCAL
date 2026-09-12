import { NextResponse } from 'next/server';
import { callsRepo } from '@/modules/data';

export const dynamic = 'force-dynamic';

/**
 * Lightweight call status for the dialer UI (polled while ringing / awaiting consent).
 * GET /api/calls/status?callId=...
 */
export async function GET(request: Request) {
  const callId = new URL(request.url).searchParams.get('callId');
  if (!callId) {
    return NextResponse.json({ error: 'callId is required' }, { status: 400 });
  }

  const call = await callsRepo.findCallStatus(callId);
  if (!call) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 });
  }

  const hungUpAsVoicemail =
    call.hangup_cause === 'answering_machine' || call.hangup_cause === 'screened_no_ring';

  let userMessage: string | null = null;
  if (hungUpAsVoicemail) {
    userMessage = 'Call went to voicemail';
  } else if (call.status === 'completed' && call.hangup_cause === 'recruiter_hangup') {
    userMessage = null;
  } else if (call.status === 'completed' && call.hangup_cause === 'no_consent') {
    userMessage = 'No response — call ended';
  } else if (
    call.status === 'completed' &&
    !call.consent_method &&
    (call.hangup_cause === 'normal_clearing' || call.hangup_cause === 'remote_hangup')
  ) {
    userMessage = 'Call went to voicemail';
  } else if (call.status === 'completed') {
    userMessage = null;
  } else if (call.status === 'awaiting_consent') {
    userMessage =
      'Candidate answered. Waiting for them to press 1 (record) or 2 (no recording). Your line rings after that — stay on.';
  } else if (call.status === 'ringing' || call.status === 'initiating') {
    userMessage = 'Calling the candidate…';
  }

  return NextResponse.json({
    callId: call.id,
    status: call.status,
    hangupCause: call.hangup_cause,
    consentMethod: call.consent_method,
    to: call.to_number,
    from: call.from_number,
    ended: call.status === 'completed',
    wentToVoicemail: hungUpAsVoicemail,
    answeredAwaitingConsent: call.status === 'awaiting_consent',
    userMessage,
  });
}
