import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Lightweight calling readiness check for local setup.
 * GET /api/health/calling
 */
export async function GET() {
  const publicAppUrl = (process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
  const webhookUrl = publicAppUrl ? `${publicAppUrl}/api/webhooks/telnyx` : null;

  const required = {
    TELNYX_API_KEY: Boolean(process.env.TELNYX_API_KEY),
    TELNYX_CALL_CONTROL_APP_ID: Boolean(process.env.TELNYX_CALL_CONTROL_APP_ID),
    TELNYX_TELEPHONY_CREDENTIAL_ID: Boolean(process.env.TELNYX_TELEPHONY_CREDENTIAL_ID),
    TELNYX_CALLER_ID: Boolean(
      process.env.TELNYX_CALLER_ID && !process.env.TELNYX_CALLER_ID.includes('XXXXXXXX')
    ),
    TELNYX_SIP_URI: Boolean(
      process.env.TELNYX_SIP_URI && !process.env.TELNYX_SIP_URI.includes('your_sip_username')
    ),
    PUBLIC_APP_URL: Boolean(
      publicAppUrl && publicAppUrl.startsWith('https://') && !publicAppUrl.includes('xxxx.ngrok')
    ),
    TELNYX_PUBLIC_KEY: Boolean(process.env.TELNYX_PUBLIC_KEY),
    RECORDING_ENABLED: process.env.RECORDING_ENABLED === 'true',
  };

  let publicReachable: boolean | null = null;
  let publicStatus: number | null = null;
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(8000),
      });
      // 401 = app reached (signature required). 404 = tunnel/path wrong.
      publicStatus = res.status;
      publicReachable = res.status === 401 || res.status === 200 || res.status === 400;
    } catch {
      publicReachable = false;
    }
  }

  const ready =
    required.TELNYX_API_KEY &&
    required.TELNYX_CALL_CONTROL_APP_ID &&
    required.TELNYX_TELEPHONY_CREDENTIAL_ID &&
    required.TELNYX_CALLER_ID &&
    required.TELNYX_SIP_URI &&
    required.PUBLIC_APP_URL &&
    publicReachable === true;

  const callerId = process.env.TELNYX_CALLER_ID || null;

  return NextResponse.json({
    ready,
    publicAppUrl: publicAppUrl || null,
    webhookUrl,
    publicReachable,
    publicStatus,
    callerId,
    required,
  });
}
