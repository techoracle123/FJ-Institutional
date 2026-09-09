import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Server-side signup.
 *
 * Supabase's built-in SMTP is rate-limited to a couple of emails per hour on
 * the free tier, which would silently break registration. We instead create
 * the user with the service role and mark the email confirmed, so accounts
 * work instantly with zero email infrastructure and zero cost.
 */
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !srk) {
    return NextResponse.json({ ok: false, error: 'Auth not configured.' }, { status: 500 });
  }

  let email: string, password: string;
  try {
    const b = await req.json();
    email = String(b.email ?? '').trim().toLowerCase();
    password = String(b.password ?? '');
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Enter a valid email address.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  const r = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: srk, Authorization: `Bearer ${srk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { journal: [] },
    }),
  });

  const j = (await r.json()) as { id?: string; msg?: string; message?: string; error_code?: string };

  if (!r.ok) {
    const raw = j.msg ?? j.message ?? 'Could not create account.';
    const friendly = /already|registered|exists/i.test(raw)
      ? 'An account with that email already exists. Sign in instead.'
      : raw;
    return NextResponse.json({ ok: false, error: friendly }, { status: r.status });
  }

  return NextResponse.json({ ok: true, id: j.id });
}
