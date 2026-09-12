import { NextResponse } from 'next/server';
import { getCallingConfigReport, getVoiceProviderName, getWebhookUrl } from '@/modules/voice';

export const dynamic = 'force-dynamic';

/**
 * Calling readiness for local setup.
 * GET /api/health/calling
 *
 * The provider reports its own requirements, so this endpoint tells the truth
 * about whichever vendor is active rather than a hardcoded checklist.
 */
export async function GET() {
  const providerName = getVoiceProviderName();

  let report: ReturnType<typeof getCallingConfigReport> | null = null;
  let reportError: string | null = null;
  try {
    report = getCallingConfigReport();
  } catch (err) {
    reportError = err instanceof Error ? err.message : 'Unknown voice provider';
  }

  let webhookUrl: string | null = null;
  let publicAppUrlValid = true;
  try {
    webhookUrl = getWebhookUrl(providerName);
  } catch {
    publicAppUrlValid = false;
  }

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

  const ready = Boolean(report?.providerReady) && publicAppUrlValid && publicReachable === true;

  return NextResponse.json({
    ready,
    provider: providerName,
    error: reportError,
    webhookUrl,
    publicReachable,
    publicStatus,
    callerId: report?.callerId ?? null,
    agentEndpointKind: report?.agentEndpointKind ?? null,
    capabilities: report?.capabilities ?? null,
    limitations: report?.limitations ?? [],
    missing: report?.missing ?? [],
    required: {
      ...(report?.required ?? {}),
      PUBLIC_APP_URL: publicAppUrlValid,
    },
  });
}
