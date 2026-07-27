import { NextResponse } from 'next/server';
import { generateWebrtcToken } from '@/lib/telnyx';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const telephonyCredentialId = process.env.TELNYX_TELEPHONY_CREDENTIAL_ID;
    if (!telephonyCredentialId) {
      return NextResponse.json(
        { error: 'TELNYX_TELEPHONY_CREDENTIAL_ID not configured' },
        { status: 500 }
      );
    }

    const token = await generateWebrtcToken(telephonyCredentialId);
    return NextResponse.json({
      token,
      callerId: process.env.TELNYX_CALLER_ID,
      sipUri: process.env.TELNYX_SIP_URI,
    });
  } catch (error) {
    console.error('Error generating token:', error);
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
  }
}
