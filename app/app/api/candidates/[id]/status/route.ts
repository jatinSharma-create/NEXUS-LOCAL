import { NextResponse } from 'next/server';
import { PIPELINE_STAGES } from '@/lib/types';
import { candidatesRepo } from '@/modules/data';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { status } = body as { status?: unknown };

    if (!status || !PIPELINE_STAGES.includes(status as never)) {
      return NextResponse.json(
        {
          error: `Invalid status. Must be one of: ${PIPELINE_STAGES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const updated = await candidatesRepo.updateCandidateStatus(
      params.id,
      status as (typeof PIPELINE_STAGES)[number]
    );

    if (!updated) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating candidate status:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
