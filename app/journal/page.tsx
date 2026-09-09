'use client';
import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, LogIn } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { INSTRUMENTS } from '@/lib/types';
import { Panel, Empty, Num, cx } from '@/components/ui';
import AuthPanel from '@/components/AuthPanel';
import { useSettings } from '@/lib/useSettings';
import { fmtDateTime } from '@/lib/time';

interface Entry {
  id: string; symbol: string; direction: string;
  entry: number | null; exit: number | null; r: number | null;
  note: string; created_at: string;
}

export default function Journal() {
  const { settings } = useSettings();
  const tz = settings.timezone;
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ symbol: 'EURUSD', direction: 'long', entry: '', exit: '', r: '', note: '' });

  const authed = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const t = data.session?.access_token;
    return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : null;
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    const h = await authed();
    if (!h) return;
    const r = await fetch('/api/journal', { headers: h, cache: 'no-store' });
    const j = await r.json();
    if (j.ok) { setRows(j.entries); setErr(null); } else setErr(j.error);
  }, [user, authed]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!user) return;
    setBusy(true);
    const h = await authed();
    if (!h) { setBusy(false); return; }
    const res = await fetch('/api/journal', { method: 'POST', headers: h, body: JSON.stringify(form) });
    const j = await res.json();
    setBusy(false);
    if (!j.ok) setErr(j.error);
    else { setForm({ ...form, entry: '', exit: '', r: '', note: '' }); load(); }
  };

  const del = async (id: string) => {
    const h = await authed();
    if (!h) return;
    await fetch(`/api/journal?id=${id}`, { method: 'DELETE', headers: h });
    load();
  };

  if (authLoading) return <div className="skeleton h-64 w-full" />;
  if (!user) return (
    <div className="space-y-5">
      <h1 className="text-[26px] font-semibold tracking-tight">Journal</h1>
      <AuthPanel message="Your journal is private to your account. Sign in to record and review your decisions." />
    </div>
  );

  const closed = rows.filter(r => r.r != null);
  const totalR = closed.reduce((a, b) => a + (b.r ?? 0), 0);
  const wins = closed.filter(r => (r.r ?? 0) > 0).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold leading-none tracking-tight">Journal</h1>
        <p className="mt-1.5 text-[12.5px]" style={{ color: 'var(--color-tertiary)' }}>
          Private to your account. The record is the only honest teacher.
        </p>
      </div>

      {closed.length > 0 && (
        <div className="grid grid-cols-3 gap-px">
          {[
            ['Closed trades', String(closed.length), 'var(--color-primary)'],
            ['Total R', (totalR >= 0 ? '+' : '') + totalR.toFixed(2), totalR >= 0 ? 'var(--color-long)' : 'var(--color-short)'],
            ['Hit rate', Math.round((wins / closed.length) * 100) + '%', 'var(--color-primary)'],
          ].map(([l, v, c]) => (
            <div key={l} className="panel px-4 py-3">
              <div className="label">{l}</div>
              <div className="num mt-1 text-[19px] font-semibold" style={{ color: c }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      <Panel title="New entry" dense>
        <div className="grid gap-2 p-4 sm:grid-cols-6">
          <select value={form.symbol} onChange={e => setForm({ ...form, symbol: e.target.value })} className="fj-input">
            {INSTRUMENTS.map(i => <option key={i.symbol} value={i.symbol}>{i.display}</option>)}
          </select>
          <select value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })} className="fj-input">
            <option value="long">Long</option><option value="short">Short</option>
          </select>
          <input placeholder="Entry" value={form.entry} onChange={e => setForm({ ...form, entry: e.target.value })} className="fj-input num" inputMode="decimal" />
          <input placeholder="Exit" value={form.exit} onChange={e => setForm({ ...form, exit: e.target.value })} className="fj-input num" inputMode="decimal" />
          <input placeholder="R result" value={form.r} onChange={e => setForm({ ...form, r: e.target.value })} className="fj-input num" inputMode="decimal" />
          <button onClick={add} disabled={busy}
            className="flex items-center justify-center gap-1.5 rounded-[3px] px-3 py-2 text-[12px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: 'var(--color-accent)', color: '#04120F' }}>
            <Plus size={13} /> Add
          </button>
          <input placeholder="What was the thesis? What did you get right or wrong?" value={form.note}
            onChange={e => setForm({ ...form, note: e.target.value })} className="fj-input sm:col-span-6" />
        </div>
      </Panel>

      {err && <p className="text-[11.5px]" style={{ color: 'var(--color-short)' }}>{err}</p>}

      {rows.length ? (
        <Panel title="Entries" dense>
          <div className="divide-y" style={{ borderColor: 'var(--color-hairline)' }}>
            {rows.map(r => (
              <div key={r.id} className="group px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-[12.5px] font-semibold">{r.symbol}</span>
                  <span className="label-xs" style={{ color: r.direction === 'long' ? 'var(--color-long)' : 'var(--color-short)' }}>
                    {r.direction}
                  </span>
                  {r.r != null && <Num value={r.r} digits={2} signed suffix="R" colorize className="text-[12px] font-medium" />}
                  <span className="num ml-auto text-[10.5px]" style={{ color: 'var(--color-quaternary)' }}>
                    {fmtDateTime(r.created_at, tz)}
                  </span>
                  <button onClick={() => del(r.id)} className="opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100">
                    <Trash2 size={12} />
                  </button>
                </div>
                {r.note && <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--color-secondary)' }}>{r.note}</p>}
              </div>
            ))}
          </div>
        </Panel>
      ) : (
        <Panel><Empty title="No entries yet" body="Log your first decision above." /></Panel>
      )}
    </div>
  );
}
