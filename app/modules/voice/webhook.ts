import { NextResponse } from 'next/server';
import { callSessionsRepo } from '@/modules/data';
import { handleCallEvent } from './core/call-flow';
import type { CallIntent, FlowCommand } from './core/domain';
import type { InboundWebhook, VoiceProvider } from './core/ports';
import { getVoiceProvider } from './registry';

/**
 * One webhook entry point for every provider.
 *
 * The provider verifies its own signature and translates its payload into
 * neutral events; the shared flow decides what should happen next; the
 * provider carries that out. This file knows none of the vendors.
 */
export async function handleVoiceWebhook(
  providerName: string,
  request: Request
): Promise<Response> {
  let provider: VoiceProvider;
  try {
    provider = getVoiceProvider(providerName);
  } catch (err) {
    console.warn(`[voice webhook] unknown provider '${providerName}'`, err);
    return NextResponse.json({ error: 'Unknown voice provider' }, { status: 404 });
  }

  const rawBody = await request.text();
  const inbound: InboundWebhook = {
    method: request.method,
    url: request.url,
    headers: request.headers,
    rawBody,
  };

  console.log(
    `[voice webhook] ${provider.name} ${request.method} content-length=${rawBody.length}`
  );

  const verified = await provider.verifyWebhook(inbound);
  if (!verified) {
    console.warn(`[voice webhook] ${provider.name} rejected: invalid or missing signature`);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Providers that answer with a document must be handled inline.
  if (provider.dispatch === 'response') {
    const intents = await collectIntents(provider, inbound);
    if (!provider.renderWebhookResponse) {
      console.error(`[voice webhook] ${provider.name} is 'response' but renders nothing`);
      return NextResponse.json({ error: 'Provider misconfigured' }, { status: 500 });
    }
    return provider.renderWebhookResponse(intents);
  }

  // Imperative providers: acknowledge immediately and keep working. The carrier
  // retries on slow responses, and none of this work needs to block the 200.
  void processInBackground(provider, inbound).catch((err) => {
    console.error(`[voice webhook] ${provider.name} background processing error:`, err);
  });

  return NextResponse.json({ received: true }, { status: 200 });
}

async function processInBackground(
  provider: VoiceProvider,
  inbound: InboundWebhook
): Promise<void> {
  const events = await provider.receiveWebhook(inbound);

  for (const event of events) {
    console.log(
      `[voice] ${provider.name} event=${event.type} leg=${event.leg} call=${event.callId ?? 'unresolved'}`
    );
    const commands = await handleCallEvent(event, {
      provider: provider.name,
      capabilities: provider.capabilities,
    });
    await dispatch(provider, commands);
  }
}

/** Run the flow without executing, for providers that reply with a document. */
async function collectIntents(
  provider: VoiceProvider,
  inbound: InboundWebhook
): Promise<CallIntent[]> {
  const events = await provider.receiveWebhook(inbound);
  const intents: CallIntent[] = [];

  for (const event of events) {
    const commands = await handleCallEvent(event, {
      provider: provider.name,
      capabilities: provider.capabilities,
    });
    for (const command of commands) {
      intents.push(...command.intents);
    }
  }

  return intents;
}

async function dispatch(provider: VoiceProvider, commands: FlowCommand[]): Promise<void> {
  for (const command of commands) {
    if (command.intents.length === 0) continue;
    try {
      await provider.execute(command.providerCallId, command.intents);
    } catch (err) {
      await releaseClaimsAfterFailure(command, err);
    }
  }
}

/**
 * A failed command must not leave a one-shot claim held, or the call stalls in
 * silence. Hangup races mid-IVR are normal and logged quietly.
 */
async function releaseClaimsAfterFailure(command: FlowCommand, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);

  for (const intent of command.intents) {
    if (intent.type === 'gatherDigits') {
      await callSessionsRepo.releaseSessionFlag(command.providerCallId, 'consentPromptPlayed');
    }
    if (intent.type === 'connectToAgent') {
      await callSessionsRepo.releaseSessionFlag(command.providerCallId, 'agentDialStarted');
    }
  }

  const session = await callSessionsRepo.getSession(command.providerCallId);
  if (session?.state?.ended || message.includes('422')) {
    console.warn(`[voice] command skipped — call no longer active: ${message}`);
    return;
  }

  console.error(`[voice] command failed on ${command.providerCallId}:`, err);
}
