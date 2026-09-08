'use client';
import { useEffect, useRef, memo } from 'react';

/**
 * TradingView Advanced Chart widget — TradingView's own data and full
 * charting functionality (drawing tools, indicators, timeframes).
 * Free to embed on a publicly accessible site.
 */
function TradingViewChart({ symbol, height = 520 }: { symbol: string; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'tradingview-widget-container__widget';
    container.style.height = `${height}px`;
    el.appendChild(container);

    const s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    s.type = 'text/javascript';
    s.async = true;
    s.innerHTML = JSON.stringify({
      autosize: false,
      width: '100%',
      height,
      symbol,
      interval: '60',
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      backgroundColor: '#0A0C11',
      gridColor: 'rgba(255,255,255,0.05)',
      hide_side_toolbar: false,
      allow_symbol_change: false,
      withdateranges: true,
      details: false,
      calendar: false,
      studies: ['STD;EMA', 'STD;RSI'],
      support_host: 'https://www.tradingview.com',
    });
    el.appendChild(s);

    return () => { el.innerHTML = ''; };
  }, [symbol, height]);

  return (
    <div
      className="tradingview-widget-container overflow-hidden rounded-[3px]"
      ref={ref}
      style={{ height, width: '100%' }}
    />
  );
}

export default memo(TradingViewChart);
