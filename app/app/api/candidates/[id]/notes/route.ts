import { NextResponse } from 'next/server';
import { getCandidateNotes, addCandidateNote } from '@/lib/candidates';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const notes = await getCandidateNotes(params.id);
    return NextResponse.json(notes);
  } catch (error) {
    console.error('Error fetching candidate notes:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json().catch(() => ({}));
    const noteText = typeof body.noteText === 'string' ? body.noteText.trim() : '';

    if (!noteText) {
      return NextResponse.json({ error: 'noteText must not be empty' }, { status: 400 });
    }

    const note = await addCandidateNote(params.id, noteText);
    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error('Error adding candidate note:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
