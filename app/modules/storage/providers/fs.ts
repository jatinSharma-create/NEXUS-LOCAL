import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ObjectStore } from '../core/ports';

/** Where the bytes live. Must be a volume shared by the app and the worker. */
function filesRoot(): string {
  return process.env.NEXUS_FILES_DIR || '/data/files';
}

/**
 * Signing secret for read URLs. Falls back to APP_PASSWORD so a small
 * deployment has one less thing to configure, but a dedicated secret is
 * better because rotating the login password should not break live links.
 */
function signingSecret(): string {
  const secret = process.env.FILES_SIGNING_SECRET?.trim() || process.env.APP_PASSWORD?.trim();
  if (!secret) {
    throw new Error(
      'Filesystem storage needs FILES_SIGNING_SECRET (or APP_PASSWORD) set to sign read URLs.'
    );
  }
  return secret;
}

/**
 * Reject anything that could escape the files directory. Keys are produced by
 * this codebase (`transcripts/<id>.pdf`, `resumes/<id>.pdf`), but they reach
 * the read path from a URL, so they are treated as untrusted input.
 */
function resolveKeyToPath(key: string): string {
  const root = filesRoot();
  const cleaned = key.replace(/\\/g, '/').replace(/^\/+/, '');

  if (!cleaned || cleaned.split('/').some((part) => part === '..' || part === '.')) {
    throw new Error(`Rejected object key: ${key}`);
  }

  const resolved = path.resolve(root, cleaned);
  const rootWithSep = path.resolve(root) + path.sep;
  if (!resolved.startsWith(rootWithSep)) {
    throw new Error(`Rejected object key: ${key}`);
  }
  return resolved;
}

function signKey(key: string, expiresAt: number): string {
  return createHmac('sha256', signingSecret()).update(`${key}:${expiresAt}`).digest('hex');
}

/** Constant-time signature check that also enforces expiry. */
function verifyKeySignature(key: string, expiresAt: number, signature: string): boolean {
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return false;

  const expected = Buffer.from(signKey(key, expiresAt), 'utf8');
  const provided = Buffer.from(signature, 'utf8');
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/**
 * Content type is stored in a sidecar next to the object, because the
 * filesystem has nowhere else to keep object metadata. Extension is the
 * fallback for anything written before the sidecar existed.
 */
async function contentTypeFor(key: string): Promise<string> {
  const filePath = resolveKeyToPath(key);
  try {
    const stored = (await readFile(`${filePath}.type`, 'utf8')).trim();
    if (stored) return stored;
  } catch {
    // No sidecar; fall through to the extension.
  }
  return CONTENT_TYPE_BY_EXTENSION[path.extname(key).toLowerCase()] || 'application/octet-stream';
}

export type SignedFileResult =
  | { ok: true; path: string; contentType: string; size: number; filename: string }
  | { ok: false; reason: 'forbidden' | 'not-found' };

/**
 * Server side of a URL produced by `FsObjectStore.signedUrl`: check the
 * signature and expiry, then describe the file on disk.
 *
 * Lives with the provider that defines the URL format so the HTTP route does
 * not have to know how keys map to paths or how links are signed.
 */
export async function openSignedFile(
  key: string,
  expiresAt: number,
  signature: string
): Promise<SignedFileResult> {
  if (!verifyKeySignature(key, expiresAt, signature)) {
    return { ok: false, reason: 'forbidden' };
  }

  let filePath: string;
  try {
    filePath = resolveKeyToPath(key);
  } catch {
    return { ok: false, reason: 'not-found' };
  }

  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) return { ok: false, reason: 'not-found' };
    return {
      ok: true,
      path: filePath,
      contentType: await contentTypeFor(key),
      size: stats.size,
      filename: key.split('/').pop() || 'download',
    };
  } catch {
    return { ok: false, reason: 'not-found' };
  }
}

/**
 * Local-disk object store. Chosen over MinIO on small instances: MinIO holds
 * 200-400 MB resident, which is a quarter of a 2 GB box, to do something the
 * kernel page cache already does well.
 *
 * Reads go out through the app's own signed `/api/files` route rather than a
 * direct URL, because nothing else is listening on the files volume.
 */
export class FsObjectStore implements ObjectStore {
  readonly name = 'fs';

  async put(buffer: Buffer, key: string, contentType: string): Promise<string> {
    const filePath = resolveKeyToPath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    if (contentType) await writeFile(`${filePath}.type`, contentType, 'utf8');
    return key;
  }

  async signedUrl(key: string, expiresInSeconds = 900): Promise<string> {
    const base = (process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
    if (!base) {
      throw new Error('Filesystem storage needs PUBLIC_APP_URL set to build read URLs.');
    }

    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    const query = new URLSearchParams({
      expires: String(expiresAt),
      sig: signKey(key, expiresAt),
    });
    return `${base}/api/files/${encodedKey}?${query.toString()}`;
  }
}
