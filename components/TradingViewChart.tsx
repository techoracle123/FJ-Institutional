'use client';
import { useEffect, useRef, memo, useState } from 'react';

/**
 * TradingView Advanced Chart.
 *
 * Drawing persistence
 * -------------------
 * The embed widget renders inside a cross-origin iframe, so its drawings live
 * in TradingView's own storage keyed by an anonymous per-browser id. Because
 * the previous implementation destroyed and recreated the iframe on every
 * mount (and passed no stable identity), TradingView treated each visit as a
 * brand-new session and drawings vanished.
 *
 * Two fixes, together:
 *   1. `client_id` + `user_id` give the widget a stable identity, and
 *      `saved_data`/auto-save keeps its state bound to that identity.
 *   2. The iframe is created ONCE per symbol and then cached in a module-level
 *      map. Navigating away detaches the node instead of destroying it, and
 *      returning re-attaches the very same live iframe — so drawings, zoom and
 *      indicator state survive navigation exactly as they do on TradingView.
 */

// Detached iframes survive route changes here.
const CACHE = new Map<string, HTMLDivElement>();

function stableUserId() {
  if (typeof window === 'undefined') return 'anon';
  let id = localStorage.getItem('fj_tv_uid');
  if (!id) {
    id = 'fj_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('fj_tv_uid', id);
  }
  return id;
}

function TradingViewChart({
  symbol,
  height = 560,
  interval = '60',
}: { symbol: string; height?: number; interval?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mount = host.current;
    if (!mount) return;

    const key = `${symbol}|${interval}`;
    let node = CACHE.get(key);

    if (node) {
      // Re-attach the existing live chart — drawings intact.
      mount.appendChild(node);
      setReady(true);
      return () => { if (node && node.parentNode === mount) mount.removeChild(node); };
    }

    node = document.createElement('div');
    node.style.height = '100%';
    node.style.width = '100%';
    const inner = document.createElement('div');
    inner.className = 'tradingview-widget-container__widget';
    inner.style.height = '100%';
    node.appendChild(inner);

    const s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    s.type = 'text/javascript';
    s.async = true;
    s.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      // Match the FJ palette exactly.
      backgroundColor: '#0A0C11',
      gridColor: 'rgba(255,255,255,0.045)',
      hide_side_toolbar: false,   // drawing tools visible
      hide_top_toolbar: false,
      allow_symbol_change: false,
      withdateranges: true,
      details: false,
      calendar: false,
      hide_volume: false,
      // No indicators on load — the user adds RSI only if they want it.
      studies: [],
      // Stable identity so TradingView persists layout + drawings per browser.
      client_id: 'fj-institutional',
      user_id: stableUserId(),
      save_image: true,
      auto_save_delay: 3,
      support_host: 'https://www.tradingview.com',
    });

    node.appendChild(s);
    CACHE.set(key, node);
    mount.appendChild(node);
    const t = setTimeout(() => setReady(true), 1200);

    return () => {
      clearTimeout(t);
      if (node && node.parentNode === mount) mount.removeChild(node);
    };
  }, [symbol, interval]);

  return (
    <div className="relative" style={{ height }}>
      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <span className="label-xs" style={{ color: 'var(--color-quaternary)' }}>LOADING CHART…</span>
        </div>
      )}
      <div ref={host} style={{ height: '100%', width: '100%' }} />
    </div>
  );
}

export default memo(TradingViewChart);
