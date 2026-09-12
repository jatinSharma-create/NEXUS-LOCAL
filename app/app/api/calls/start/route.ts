import { NextResponse } from 'next/server';
import { candidatesRepo } from '@/modules/data';
import {
  getAgentEndpoint,
  getCallerId,
  getVoiceProviderName,
  getWebhookUrl,
  startOutboundCall,
} from '@/modules/voice';
import { normalizeDialerInput } from '@/lib/phone';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const candidateId = body.candidateId as string | undefined;
    const rawPhone = body.phone as string | undefined;

    if (!candidateId && !rawPhone) {
      return NextResponse.json({ error: 'Provide candidateId or phone' }, { status: 400 });
    }

    const callerId = getCallerId();
    if (!callerId || callerId.includes('XXXXXXXX')) {
      return NextResponse.json({ error: 'VOICE_CALLER_ID is not configured' }, { status: 500 });
    }

    if (!getAgentEndpoint()) {
      return NextResponse.json(
        { error: 'VOICE_AGENT_ENDPOINT is not configured' },
        { status: 500 }
      );
    }

    // Fail fast if the public URL is missing — otherwise the callee answers to
    // silence, because the provider cannot deliver webhooks and the IVR never runs.
    try {
      getWebhookUrl(getVoiceProviderName());
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'PUBLIC_APP_URL is not configured' },
        { status: 500 }
      );
    }

    let resolvedCandidateId: string | null = null;
    let dialPhone: string;

    if (candidateId) {
      const candidate = await candidatesRepo.findDialTargetById(candidateId);
      if (!candidate) {
        return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
      }
      if (candidate.do_not_contact) {
        return NextResponse.json({ error: 'Candidate has opted out' }, { status: 422 });
      }

      resolvedCandidateId = candidate.id;
      dialPhone = candidate.phone;
    } else {
      const normalized = normalizeDialerInput(String(rawPhone));
      if (!normalized) {
        return NextResponse.json(
          { error: 'Invalid phone number. Include a country code (e.g. +61…).' },
          { status: 422 }
        );
      }
      dialPhone = normalized;

      const match = await candidatesRepo.findDialTargetByPhone(normalized);
      if (match) {
        if (match.do_not_contact) {
          return NextResponse.json({ error: 'This number has opted out' }, { status: 422 });
        }
        resolvedCandidateId = match.id;
      }
    }

    const { callId, providerCallId, provider } = await startOutboundCall({
      candidateId: resolvedCandidateId,
      to: dialPhone,
    });

    return NextResponse.json({
      success: true,
      callId,
      providerCallId,
      provider,
      candidateId: resolvedCandidateId,
      phone: dialPhone,
    });
  } catch (error) {
    console.error('Error starting call:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
