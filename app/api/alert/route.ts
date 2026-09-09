import { NextResponse } from 'next/server';
import { marketState } from '@/lib/engines';
import { buildBoard } from '@/lib/thesis';
import { buildSummary } from '@/lib/summary';
import { bySymbol } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Telegram alert dispatch.
 *
 * Called by the scheduled workflow. Sends the current board to the
 * configured chat. Only publishes theses that clear the gates — if the
 * engine is silent, the alert says so rather than inventing a trade.
 */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function GET(req: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) {
    return NextResponse.json({ ok: false, error: 'Telegram not configured.' }, { status: 500 });
  }

  // Simple shared-secret guard so the endpoint cannot be spammed publicly.
  const secret = process.env.ALERT_SECRET;
  if (secret && new URL(req.url).searchParams.get('key') !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  const s = await marketState();
  const { theses } = buildBoard(s);
  const sum = buildSummary(s, theses);

  const L: string[] = [];
  L.push('<b>FJ INSTITUTIONAL</b>');
  L.push(`<i>${esc(sum.headline)}</i>`);
  L.push('');
  L.push(`Regime: <b>${esc(s.regime.risk)}</b> · vol ${esc(s.regime.vol)} · USD ${esc(s.regime.dollar)}`);
  L.push(`Driver: ${esc(s.regime.dominantDriver)} (${s.regime.dominantDriverStrength}%)`);
  L.push(`Data confidence: ${s.dataConfidence}%`);
  L.push('');

  if (theses.length) {
    L.push('<b>Opportunities</b>');
    for (const t of theses.slice(0, 4)) {
      const i = bySymbol(t.symbol);
      const d = i?.digits ?? 2;
      L.push(
        `\n${t.direction === 'long' ? '🟢 LONG' : '🔴 SHORT'} <b>${esc(i?.display ?? t.symbol)}</b> · ${esc(t.conviction)}`
      );
      L.push(`Probability ${t.probability}% · R:R ${t.rr}:1 · EV ${t.expectedValue}R`);
      L.push(`Entry ${t.entryLow.toFixed(d)}–${t.entryHigh.toFixed(d)}`);
      L.push(`Stop ${t.stop.toFixed(d)} · T1 ${t.t1.toFixed(d)} · T2 ${t.t2.toFixed(d)}`);
      L.push(`<i>${esc(t.headline)}</i>`);
    }
  } else {
    L.push('<b>No opportunities.</b> Evidence is conflicting or liquidity is thin. Staying flat.');
  }

  if (s.anomalies.length) {
    L.push('');
    L.push(`⚠️ ${esc(s.anomalies[0].title)}`);
  }

  L.push('');
  L.push('<i>Analysis, not advice. You execute elsewhere.</i>');

  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chat,
      text: L.join('\n'),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  const j = (await r.json()) as { ok?: boolean; description?: string };
  if (!j.ok) {
    return NextResponse.json({ ok: false, error: j.description ?? 'Telegram rejected the message.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sent: theses.length, at: new Date().toISOString() });
}
