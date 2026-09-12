import type { NamedProvider } from '@/modules/shared/registry';

/**
 * What Nexus needs from an object store: put bytes under a key, and hand the
 * browser a temporary URL to read them back.
 *
 * Deliberately smaller than any vendor's SDK — S3, R2, GCS, Azure Blob or a
 * plain filesystem can all satisfy this.
 */
export interface ObjectStore extends NamedProvider {
  /** Store bytes and return the key they can be read back with. */
  put(buffer: Buffer, key: string, contentType: string): Promise<string>;
  /** A time-limited URL the browser can fetch directly. */
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}
