import { NextResponse } from 'next/server';
import { parseResume } from '@/lib/llm';
import { normalizePhone } from '@/lib/phone';
import { normalizeEmail } from '@/lib/email';
import { query } from '@/lib/db';
import { uploadFile } from '@/lib/storage';
import { toParsedJsonBody } from '@/lib/schemas';
import { randomUUID } from 'crypto';
import * as mammoth from 'mammoth';

export const runtime = 'nodejs';

const VALID_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9.-]/g, '_');
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const entry = formData.get('file');

    if (!entry || typeof entry === 'string' || !('arrayBuffer' in entry)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const file = entry as File;

    if (!VALID_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Unsupported file type. Use PDF or DOCX.' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Max 10MB.' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = '';

    if (file.type === 'application/pdf') {
      const pdfParse = (await import('pdf-parse')).default;
      const parsed = await pdfParse(buffer);
      text = parsed.text;
    } else {
      const parsed = await mammoth.extractRawText({ buffer });
      text = parsed.value;
    }

    if (!text.trim()) {
      return NextResponse.json({ error: 'Could not extract text from file' }, { status: 422 });
    }

    let parsedResume;
    try {
      parsedResume = await parseResume(text);
    } catch (error) {
      console.error('LLM Parse Error:', error);
      return NextResponse.json({ error: 'Failed to parse resume using AI' }, { status: 502 });
    }

    const validPhone = normalizePhone(parsedResume.phone);
    if (!validPhone) {
      return NextResponse.json(
        { error: 'No valid phone number found in resume. A phone number is required.' },
        { status: 422 }
      );
    }

    const email = normalizeEmail(parsedResume.email);
    const parsedBody = toParsedJsonBody(parsedResume);

    let existing = await query<{ id: string }>(
      'SELECT id FROM candidates WHERE phone = $1 AND deleted_at IS NULL',
      [validPhone]
    );

    if (existing.rows.length === 0 && email) {
      existing = await query<{ id: string }>(
        'SELECT id FROM candidates WHERE LOWER(email) = $1 AND deleted_at IS NULL',
        [email]
      );
    }

    let candidateId: string;

    if (existing.rows.length > 0) {
      candidateId = existing.rows[0].id;
    } else {
      const inserted = await query<{ id: string }>(
        `INSERT INTO candidates (name, email, phone, parsed_json, status, updated_at)
         VALUES ($1, $2, $3, $4, 'new', NOW())
         RETURNING id`,
        [parsedResume.name, email, validPhone, parsedBody]
      );
      candidateId = inserted.rows[0].id;
    }

    const resumeKey = `resumes/${candidateId}/${randomUUID()}-${sanitizeFilename(file.name)}`;
    await uploadFile(buffer, resumeKey, file.type);

    await query(
      `UPDATE candidates
       SET name = $1, email = $2, phone = $3, parsed_json = $4, resume_url = $5, updated_at = NOW()
       WHERE id = $6`,
      [parsedResume.name, email, validPhone, parsedBody, resumeKey, candidateId]
    );

    return NextResponse.json({
      id: candidateId,
      name: parsedResume.name,
      email,
      phone: validPhone,
      parsed_json: parsedBody,
    });
  } catch (error) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
