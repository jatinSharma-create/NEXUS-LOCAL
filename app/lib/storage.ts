import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const credentials = {
  accessKeyId: process.env.MINIO_ACCESS_KEY || 'admin',
  secretAccessKey: process.env.MINIO_SECRET_KEY || 'password123',
};

const BUCKET_NAME = process.env.MINIO_BUCKET || 'nexus';

const internalEndpoint = `http://${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || '9000'}`;
const publicEndpoint = process.env.MINIO_PUBLIC_ENDPOINT || 'http://localhost:9000';

const s3Client = new S3Client({
  region: 'us-east-1',
  endpoint: internalEndpoint,
  credentials,
  forcePathStyle: true,
});

const publicS3Client = new S3Client({
  region: 'us-east-1',
  endpoint: publicEndpoint,
  credentials,
  forcePathStyle: true,
});

function isBucketMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404;
}

export async function ensureBucket() {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
  } catch (error: unknown) {
    if (isBucketMissingError(error)) {
      await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
    } else {
      throw error;
    }
  }
}

export async function uploadFile(buffer: Buffer, key: string, contentType: string): Promise<string> {
  await ensureBucket();
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return key;
}

export async function getPresignedUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  return getSignedUrl(publicS3Client, command, { expiresIn: 900 });
}
