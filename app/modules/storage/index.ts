import { createRegistry } from '@/modules/shared/registry';
import type { ObjectStore } from './core/ports';
import { FsObjectStore } from './providers/fs';
import { S3ObjectStore } from './providers/s3';

const registry = createRegistry<ObjectStore>('storage');

registry.register('s3', () => new S3ObjectStore());
// Local disk, for instances too small to justify running MinIO.
registry.register('fs', () => new FsObjectStore());

export function getObjectStore(): ObjectStore {
  return registry.resolve(process.env.STORAGE_PROVIDER || 's3');
}

/** Store bytes and return the key they can be read back with. */
export function uploadFile(buffer: Buffer, key: string, contentType: string): Promise<string> {
  return getObjectStore().put(buffer, key, contentType);
}

/** A time-limited URL the browser can fetch directly. */
export function getPresignedUrl(key: string): Promise<string> {
  return getObjectStore().signedUrl(key);
}

export type { ObjectStore } from './core/ports';

/**
 * Read side of the `fs` provider's signed URLs, used by /api/files.
 * Irrelevant when STORAGE_PROVIDER=s3, where the store signs its own URLs.
 */
export { openSignedFile } from './providers/fs';
export type { SignedFileResult } from './providers/fs';

export const availableStorageProviders = registry.names;
