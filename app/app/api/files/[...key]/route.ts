import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { openSignedFile } from '@/modules/storage';

// Needs the Node runtime: this reads from the files volume.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Read path for the `fs` storage provider.
 *
 * GET /api/files/transcripts/<id>.pdf?expires=<unix>&sig=<hmac>
 *
 * Stands in for an S3 presigned URL. The signature and expiry are checked so
 * a link cannot be reused indefinitely; the session cookie is still required
 * by `middleware.ts`, which deliberately does not exempt this path.
 */
export async function GET(request: NextRequest, { params }: { params: { key: string[] } }) {
  const key = params.key.map(decodeURIComponent).join('/');

  const file = await openSignedFile(
    key,
    Number(request.nextUrl.searchParams.get('expires')),
    request.nextUrl.searchParams.get('sig') || ''
  );

  if (!file.ok) {
    return file.reason === 'forbidden'
      ? NextResponse.json({ error: 'Link is invalid or has expired' }, { status: 403 })
      : NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Streamed rather than buffered: the app runs with a 320 MB heap cap.
  const body = Readable.toWeb(createReadStream(file.path)) as ReadableStream;

  return new NextResponse(body, {
    headers: {
      'Content-Type': file.contentType,
      'Content-Length': String(file.size),
      'Content-Disposition': `inline; filename="${file.filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
