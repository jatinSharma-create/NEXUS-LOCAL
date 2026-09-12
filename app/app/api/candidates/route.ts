import { NextResponse } from 'next/server';
import { candidatesRepo } from '@/modules/data';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') ?? undefined;
    const candidates = await candidatesRepo.getCandidates(q);
    return NextResponse.json(candidates);
  } catch (error) {
    console.error('Error fetching candidates:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
