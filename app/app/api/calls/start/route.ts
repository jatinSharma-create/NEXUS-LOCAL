import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { dial } from '@/lib/telnyx';
import { normalizePhone } from '@/lib/phone';

export const dynamic = 'force-dynamic';

type MatchedCandidate = {
  id: string;
  phone: string;
  do_not_contact: boolean;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const candidateId = body.candidateId as string | undefined;
    const rawPhone = body.phone as string | undefined;

    if (!candidateId && !rawPhone) {
      return NextResponse.json({ error: 'Provide candidateId or phone' }, { status: 400 });
    }

    const recruiterSipUri = process.env.TELNYX_SIP_URI;
    const fromNumber = process.env.TELNYX_CALLER_ID;

    if (!fromNumber || fromNumber.includes('XXXXXXXX')) {
      return NextResponse.json(
        { error: 'TELNYX_CALLER_ID is not configured' },
        { status: 500 }
      );
    }

    if (!recruiterSipUri || recruiterSipUri.includes('your_sip_username')) {
      return NextResponse.json(
        { error: 'TELNYX_SIP_URI is not configured' },
        { status: 500 }
      );
    }

    let resolvedCandidateId: string | null = null;
    let dialPhone: string;

    if (candidateId) {
      const candidateRes = await query<MatchedCandidate>(
        `SELECT id, phone, do_not_contact FROM candidates
         WHERE id = $1 AND deleted_at IS NULL`,
        [candidateId]
      );

      if (candidateRes.rows.length === 0) {
        return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
      }

      const candidate = candidateRes.rows[0];
      if (candidate.do_not_contact) {
        return NextResponse.json({ error: 'Candidate has opted out' }, { status: 422 });
      }

      resolvedCandidateId = candidate.id;
      dialPhone = candidate.phone;
    } else {
      const normalized = normalizePhone(String(rawPhone));
      if (!normalized) {
        return NextResponse.json(
          { error: 'Invalid phone number. Include a country code (e.g. +61…).' },
          { status: 422 }
        );
      }
      dialPhone = normalized;

      const match = await query<MatchedCandidate>(
        `SELECT id, phone, do_not_contact FROM candidates
         WHERE phone = $1 AND deleted_at IS NULL`,
        [normalized]
      );

      if (match.rows[0]) {
        if (match.rows[0].do_not_contact) {
          return NextResponse.json({ error: 'This number has opted out' }, { status: 422 });
        }
        resolvedCandidateId = match.rows[0].id;
      }
    }

    const insertRes = await query<{ id: string }>(
      `INSERT INTO calls (candidate_id, direction, from_number, to_number, status)
       VALUES ($1, 'outbound', $2, $3, 'initiating')
       RETURNING id`,
      [resolvedCandidateId, fromNumber, dialPhone]
    );

    const callId = insertRes.rows[0].id;
    const clientState = JSON.stringify({
      call_id: callId,
      candidate_id: resolvedCandidateId,
      recruiter_sip_uri: recruiterSipUri,
      leg: 'candidate',
    });

    const dialResult = await dial(dialPhone, fromNumber, clientState);
    const callControlId =
      dialResult?.data?.call_control_id || dialResult?.data?.id || dialResult?.call_control_id;

    if (callControlId) {
      await query(`UPDATE calls SET telnyx_call_control_id = $1, client_state = $2 WHERE id = $3`, [
        callControlId,
        clientState,
        callId,
      ]);
    }

    return NextResponse.json({
      success: true,
      callId,
      callControlId: callControlId || null,
      candidateId: resolvedCandidateId,
      phone: dialPhone,
    });
  } catch (error) {
    console.error('Error starting call:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
