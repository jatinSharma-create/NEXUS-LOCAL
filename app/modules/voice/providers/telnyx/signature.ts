import { createPublicKey, verify } from 'crypto';

/**
 * Telnyx signs webhooks with Ed25519 over `${timestamp}|${rawBody}`.
 * Mission Control hands out a base64 raw 32-byte public key.
 */
export function verifyTelnyxSignature(
  payload: string,
  signatureHeader: string,
  timestampHeader: string
): boolean {
  const publicKey = process.env.TELNYX_PUBLIC_KEY || '';
  if (!publicKey) {
    // Dev bypass when the key is not configured yet.
    return true;
  }

  try {
    const signature = Buffer.from(signatureHeader, 'base64');
    const signedPayload = Buffer.from(`${timestampHeader}|${payload}`);

    let keyObject;
    if (publicKey.includes('BEGIN PUBLIC KEY')) {
      keyObject = createPublicKey(publicKey);
    } else {
      // Wrap the raw key into SPKI DER so Node's typed createPublicKey accepts it.
      const rawKey = Buffer.from(publicKey, 'base64');
      const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
      keyObject = createPublicKey({
        key: Buffer.concat([spkiPrefix, rawKey]),
        format: 'der',
        type: 'spki',
      });
    }

    return verify(null, signedPayload, keyObject, signature);
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return false;
  }
}
