import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import * as mammoth from 'mammoth';
import { candidatesRepo } from '@/modules/data';
import { parseResume } from '@/modules/intelligence';
import { uploadFile } from '@/modules/storage';
import { normalizePhone } from '@/lib/phone';
import { normalizeEmail } from '@/lib/email';
import { toParsedJsonBody } from '@/lib/schemas';

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
      return NextResponse.json(
        { error: 'Unsupported file type. Use PDF or DOCX.' },
        { status: 400 }
      );
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
      console.error('Resume parse error:', error);
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

    let candidateId = await candidatesRepo.findActiveIdByPhone(validPhone);
    if (!candidateId && email) {
      candidateId = await candidatesRepo.findActiveIdByEmail(email);
    }

    if (!candidateId) {
      candidateId = await candidatesRepo.createCandidate({
        name: parsedResume.name,
        email,
        phone: validPhone,
        parsedJson: parsedBody,
      });
    }

    const resumeKey = `resumes/${candidateId}/${randomUUID()}-${sanitizeFilename(file.name)}`;
    await uploadFile(buffer, resumeKey, file.type);

    await candidatesRepo.applyResumeToCandidate(candidateId, {
      name: parsedResume.name,
      email,
      phone: validPhone,
      parsedJson: parsedBody,
      resumeKey,
    });

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
