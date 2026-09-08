import { NextResponse } from 'next/server';
import { marketState } from '@/lib/engines';
import { buildBoard } from '@/lib/thesis';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const s = await marketState();
    const board = buildBoard(s);
    return NextResponse.json(
      { ok: true, ...s, ...board },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=240' } }
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
