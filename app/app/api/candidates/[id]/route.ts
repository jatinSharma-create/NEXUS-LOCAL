import { NextResponse } from 'next/server';
import { candidatesRepo } from '@/modules/data';
import { getPresignedUrl } from '@/modules/storage';
import { normalizePhone } from '@/lib/phone';
import { normalizeEmail } from '@/lib/email';
import { PIPELINE_STAGES, type PipelineStage } from '@/lib/types';
import type { ParsedJsonBody } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const candidate = await candidatesRepo.getCandidateById(params.id);
    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

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

    const current = await candidatesRepo.getCandidateById(params.id);
    if (!current) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    let updatedPhone = current.phone;
    let updatedEmail = current.email;

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

    if (status !== undefined && !PIPELINE_STAGES.includes(status as never)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const parsedJson = (current.parsed_json ?? {}) as Partial<ParsedJsonBody>;
    if (current_role !== undefined) {
      parsedJson.current_role = current_role || null;
    }

    const updated = await candidatesRepo.updateCandidateProfile(params.id, {
      name: name ?? null,
      email: updatedEmail,
      phone: updatedPhone,
      status: (status as PipelineStage) ?? null,
      parsedJson,
    });

    return NextResponse.json(updated);
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
    const deletedId = await candidatesRepo.softDeleteCandidate(params.id);
    if (!deletedId) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, id: deletedId });
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

    const restored = await candidatesRepo.restoreCandidate(params.id);
    if (!restored) {
      return NextResponse.json(
        { error: 'Candidate not found in Trash or recovery window expired' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, id: restored.id, name: restored.name });
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
