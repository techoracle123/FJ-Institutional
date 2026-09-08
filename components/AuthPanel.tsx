'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Panel } from './ui';

export default function AuthPanel({ message }: { message?: string }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true); setMsg(null);
    if (mode === 'up') {
      // Server-side creation: instant, no confirmation email required.
      const r = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pw }),
      });
      const j = await r.json();
      if (!j.ok) { setBusy(false); setMsg(j.error); return; }
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) setMsg(error.message);
  };

  return (
    <Panel dense>
      <div className="mx-auto max-w-[340px] px-4 py-8">
        <h2 className="text-[15px] font-semibold tracking-tight">
          {mode === 'in' ? 'Sign in' : 'Create account'}
        </h2>
        {message && <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--color-tertiary)' }}>{message}</p>}

        <div className="mt-4 space-y-2">
          <input className="fj-input w-full" placeholder="Email" type="email" autoComplete="email"
            value={email} onChange={e => setEmail(e.target.value)} />
          <input className="fj-input w-full" placeholder="Password" type="password"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={pw} onChange={e => setPw(e.target.value)} />
          <button onClick={go} disabled={busy || !email || !pw}
            className="w-full rounded-[3px] px-3 py-2 text-[12px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: 'var(--color-accent)', color: '#04120F' }}>
            {busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}
          </button>
        </div>

        {msg && <p className="mt-3 text-[11.5px]" style={{ color: 'var(--color-warn)' }}>{msg}</p>}

        <button onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null); }}
          className="mt-4 text-[11.5px] transition-colors hover:text-[var(--color-secondary)]"
          style={{ color: 'var(--color-quaternary)' }}>
          {mode === 'in' ? 'No account? Create one' : 'Already have an account? Sign in'}
        </button>
      </div>
    </Panel>
  );
}
