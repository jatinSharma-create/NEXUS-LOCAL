import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/telnyx';
import { handleWebhookEvent } from '@/lib/telnyx-call-flow';

/**
 * Shared Telnyx webhook entrypoint.
 * Spec: verify payload, resolve call via client_state / call_control_id,
 * kick off processing in the background, and return HTTP 200 immediately.
 */
export async function handleTelnyxWebhookRequest(request: Request): Promise<NextResponse> {
  try {
    const signature = request.headers.get('telnyx-signature-ed25519');
    const timestamp = request.headers.get('telnyx-timestamp');
    const body = await request.text();

    console.log(
      `[telnyx webhook] hit ${request.method} content-length=${body.length} hasSig=${Boolean(signature)}`
    );

    if (process.env.TELNYX_PUBLIC_KEY) {
      if (!signature || !timestamp) {
        console.warn('[telnyx webhook] rejected: missing signature headers');
        return NextResponse.json({ error: 'Missing signature headers' }, { status: 401 });
      }
      const isValid = verifyWebhookSignature(body, signature, timestamp);
      if (!isValid) {
        console.warn('[telnyx webhook] rejected: invalid signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    let event: { data?: { event_type?: string; payload?: Record<string, unknown> } };
    try {
      event = JSON.parse(body);
    } catch {
      console.warn('[telnyx webhook] rejected: invalid JSON');
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const eventType = event?.data?.event_type;
    console.log(`[telnyx webhook] event_type=${eventType || 'unknown'}`);

    // Respond 200 immediately — do not await Telnyx Call Control / DB work inline.
    // Docker keeps the Node process alive, so background work can finish after the response.
    if (eventType && event.data) {
      void handleWebhookEvent(event.data as { event_type: string; payload: Record<string, unknown> }).catch(
        (err) => {
          console.error('[telnyx webhook] background processing error:', err);
        }
      );
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Webhook processing error:', error);
    // Still return 200 when possible so Telnyx does not retry forever on our bugs —
    // but signature/parse failures above return 4xx intentionally.
    return NextResponse.json({ received: true, error: 'logged' }, { status: 200 });
  }
}
