import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getPresignedUrl } from '@/lib/storage';
import { normalizePhone } from '@/lib/phone';
import { normalizeEmail } from '@/lib/email';
import type { CandidateListItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['new', 'screening', 'interviewing', 'offer', 'hired', 'rejected'];
const TRASH_RETENTION_DAYS = 30;

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await query(
      'SELECT * FROM candidates WHERE id = $1 AND deleted_at IS NULL',
      [params.id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    const candidate = result.rows[0];
    let resume_download_url = null;

    if (candidate.resume_url) {
      try {
        resume_download_url = await getPresignedUrl(candidate.resume_url);
      } catch (err) {
        console.error('Error generating presigned URL:', err);
      }
    }

    return NextResponse.json({ ...candidate, resume_download_url });
  } catch (error) {
    console.error('Error fetching candidate:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const { name, email, phone, status, current_role } = body;

    const existing = await query(
      'SELECT * FROM candidates WHERE id = $1 AND deleted_at IS NULL',
      [params.id]
    );
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    const current = existing.rows[0];
    let updatedPhone = current.phone;
    let updatedEmail = current.email as string | null;

    if (phone !== undefined) {
      const normalized = normalizePhone(phone);
      if (!normalized) {
        return NextResponse.json({ error: 'Invalid phone number' }, { status: 422 });
      }
      updatedPhone = normalized;
    }

    if (email !== undefined) {
      if (email === null || email === '') {
        updatedEmail = null;
      } else {
        const normalized = normalizeEmail(email);
        if (!normalized) {
          return NextResponse.json({ error: 'Invalid email address' }, { status: 422 });
        }
        updatedEmail = normalized;
      }
    }

    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const parsedJson = current.parsed_json ?? {};
    if (current_role !== undefined) {
      parsedJson.current_role = current_role || null;
    }

    const result = await query<CandidateListItem>(
      `UPDATE candidates
       SET name = COALESCE($1, name),
           email = $2,
           phone = $3,
           status = COALESCE($4, status),
           parsed_json = $5,
           updated_at = NOW()
       WHERE id = $6 AND deleted_at IS NULL
       RETURNING id, name, email, phone, status, parsed_json->>'current_role' as current_role, created_at`,
      [
        name ?? null,
        updatedEmail,
        updatedPhone,
        status ?? null,
        parsedJson,
        params.id,
      ]
    );

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating candidate:', error);
    const pgError = error as { code?: string };
    if (pgError.code === '23505') {
      return NextResponse.json(
        { error: 'Phone number already in use by another candidate' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await query(
      `UPDATE candidates
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [params.id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Error soft-deleting candidate:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.action !== 'restore') {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }

    const result = await query(
      `UPDATE candidates
       SET deleted_at = NULL, updated_at = NOW()
       WHERE id = $1
         AND deleted_at IS NOT NULL
         AND deleted_at > NOW() - ($2::INT * INTERVAL '1 day')
       RETURNING id, name`,
      [params.id, TRASH_RETENTION_DAYS]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Candidate not found in Trash or recovery window expired' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, id: result.rows[0].id, name: result.rows[0].name });
  } catch (error) {
    console.error('Error restoring candidate:', error);
    const pgError = error as { code?: string };
    if (pgError.code === '23505') {
      return NextResponse.json(
        { error: 'Cannot restore: phone number is now used by another candidate' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
