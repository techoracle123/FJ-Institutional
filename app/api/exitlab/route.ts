import { NextResponse } from 'next/server';
import { fetchExitLab } from '@/lib/exitlab';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await fetchExitLab();
  if (!data) return NextResponse.json({ ok: false, error: 'Exit research unavailable.' }, { status: 503 });
  return NextResponse.json({ ok: true, ...data });
}
