import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Journal persistence.
 *
 * Entries live in the authenticated user's Supabase `user_metadata`, which
 * requires no database schema and no migration step. Every request is
 * authorised by verifying the caller's access token against Supabase before
 * the service role is used to read or write — a user can only ever touch
 * their own record.
 */

interface Entry {
  id: string; symbol: string; direction: 'long' | 'short';
  entry: number | null; exit: number | null; r: number | null;
  note: string; created_at: string;
}

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const srk = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Resolve the bearer token to a user id. Returns null if invalid. */
async function whoami(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const r = await fetch(`${url()}/auth/v1/user`, {
    headers: { apikey: srk(), Authorization: auth },
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { id?: string };
  return j.id ?? null;
}

async function readJournal(uid: string): Promise<Entry[]> {
  const r = await fetch(`${url()}/auth/v1/admin/users/${uid}`, {
    headers: { apikey: srk(), Authorization: `Bearer ${srk()}` },
  });
  if (!r.ok) return [];
  const j = (await r.json()) as { user_metadata?: { journal?: Entry[] } };
  return Array.isArray(j.user_metadata?.journal) ? j.user_metadata!.journal! : [];
}

async function writeJournal(uid: string, journal: Entry[]) {
  await fetch(`${url()}/auth/v1/admin/users/${uid}`, {
    method: 'PUT',
    headers: { apikey: srk(), Authorization: `Bearer ${srk()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_metadata: { journal } }),
  });
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
};

export async function GET(req: Request) {
  const uid = await whoami(req);
  if (!uid) return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 });
  return NextResponse.json({ ok: true, entries: await readJournal(uid) });
}

export async function POST(req: Request) {
  const uid = await whoami(req);
  if (!uid) return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 });

  const b = await req.json().catch(() => null);
  if (!b?.symbol) return NextResponse.json({ ok: false, error: 'Symbol required.' }, { status: 400 });

  const entry: Entry = {
    id: crypto.randomUUID(),
    symbol: String(b.symbol).slice(0, 12),
    direction: b.direction === 'short' ? 'short' : 'long',
    entry: num(b.entry), exit: num(b.exit), r: num(b.r),
    note: String(b.note ?? '').slice(0, 800),
    created_at: new Date().toISOString(),
  };

  const journal = await readJournal(uid);
  journal.unshift(entry);
  await writeJournal(uid, journal.slice(0, 300)); // metadata size guard
  return NextResponse.json({ ok: true, entry });
}

export async function DELETE(req: Request) {
  const uid = await whoami(req);
  if (!uid) return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'id required.' }, { status: 400 });

  const journal = await readJournal(uid);
  await writeJournal(uid, journal.filter(e => e.id !== id));
  return NextResponse.json({ ok: true });
}
