import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ObjectStore } from '../core/ports';

/**
 * S3-compatible object store: MinIO locally, or any S3/R2/GCS-compatible
 * endpoint in production.
 */
export class S3ObjectStore implements ObjectStore {
  readonly name = 's3';

  private readonly bucket = process.env.MINIO_BUCKET || 'nexus';
  private internal: S3Client | null = null;
  private external: S3Client | null = null;
  private bucketReady = false;

  /** Full URL override for cloud S3/R2 (e.g. https://xxx.r2.cloudflarestorage.com). */
  private resolveEndpoint(fallbackPublic: boolean): string {
    const override = process.env.STORAGE_ENDPOINT?.trim();
    if (override) return override.replace(/\/$/, '');

    const host = process.env.MINIO_ENDPOINT || 'localhost';
    const port = process.env.MINIO_PORT || '9000';
    const useSsl =
      process.env.S3_USE_SSL === 'true' ||
      port === '443' ||
      (fallbackPublic && (process.env.MINIO_PUBLIC_ENDPOINT || '').startsWith('https://'));

    if (host.startsWith('http://') || host.startsWith('https://')) {
      return host.replace(/\/$/, '');
    }

    const protocol = useSsl ? 'https' : 'http';
    const omitPort = (useSsl && port === '443') || (!useSsl && port === '80');
    return omitPort ? `${protocol}://${host}` : `${protocol}://${host}:${port}`;
  }

  private client(external: boolean): S3Client {
    const cached = external ? this.external : this.internal;
    if (cached) return cached;

    const endpoint = external
      ? process.env.MINIO_PUBLIC_ENDPOINT?.trim().replace(/\/$/, '') || this.resolveEndpoint(true)
      : this.resolveEndpoint(false);

    const client = new S3Client({
      region: 'us-east-1',
      endpoint,
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY || 'admin',
        secretAccessKey: process.env.MINIO_SECRET_KEY || 'password123',
      },
      forcePathStyle: true,
    });

    if (external) this.external = client;
    else this.internal = client;
    return client;
  }

  private static isBucketMissing(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    return err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404;
  }

  private async ensureBucket(): Promise<void> {
    if (this.bucketReady) return;
    const client = this.client(false);
    try {
      await client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error: unknown) {
      if (S3ObjectStore.isBucketMissing(error)) {
        await client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } else {
        throw error;
      }
    }
    this.bucketReady = true;
  }

  async put(buffer: Buffer, key: string, contentType: string): Promise<string> {
    await this.ensureBucket();
    await this.client(false).send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return key;
  }

  async signedUrl(key: string, expiresInSeconds = 900): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client(true), command, { expiresIn: expiresInSeconds });
  }
}
