'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Activity, Layers, CalendarDays, LineChart, ClipboardList, Radar, Radio } from 'lucide-react';
import { cx, LiveDot } from './ui';
import AuthButton from './AuthButton';
import { useSettings } from '@/lib/useSettings';
import { fmtTime, zoneAbbr } from '@/lib/time';

const NAV = [
  { href: '/', label: 'Now', icon: Activity },
  { href: '/opportunities', label: 'Opportunities', icon: Layers },
  { href: '/live', label: 'Live', icon: Radio },
  { href: '/markets', label: 'Markets', icon: LineChart },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/record', label: 'Track Record', icon: Radar },
  { href: '/journal', label: 'Journal', icon: ClipboardList },
];

function MarketClock() {
  // Sessions are computed in UTC (market truth) but DISPLAYED in the user's
  // zone. Assuming everyone is at UTC+0 was the bug; a fixed offset would
  // also break twice a year, so we use IANA zones throughout.
  const { settings } = useSettings();
  const tz = settings.timezone;
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <div className="h-4 w-40" />;

  const h = now.getUTCHours() + now.getUTCMinutes() / 60;
  const sessions = [
    { name: 'TOKYO', open: h >= 0 && h < 8 },
    { name: 'LONDON', open: h >= 7 && h < 16 },
    { name: 'NEW YORK', open: h >= 12.5 && h < 21 },
  ];
  const overlap = h >= 12.5 && h < 16;
  const depth = overlap ? 'HIGH' : (h >= 21 || h < 6) ? 'THIN' : 'NORMAL';
  const depthColor = depth === 'HIGH' ? 'var(--color-long)' : depth === 'THIN' ? 'var(--color-short)' : 'var(--color-secondary)';

  return (
    <div className="flex items-center gap-3">
      <div className="hidden items-center gap-2.5 md:flex">
        {sessions.map(s => (
          <span key={s.name} className="flex items-center gap-1">
            <i className="block h-1 w-1 rounded-full"
              style={{ background: s.open ? 'var(--color-long)' : 'var(--color-quaternary)' }} />
            <span className="label-xs" style={{ color: s.open ? 'var(--color-secondary)' : 'var(--color-quaternary)' }}>
              {s.name}
            </span>
          </span>
        ))}
      </div>
      <span className="hidden h-3 w-px md:block" style={{ background: 'var(--color-hairline-strong)' }} />
      <span className="label-xs hidden sm:inline" style={{ color: 'var(--color-quaternary)' }}>DEPTH</span>
      <span className="label-xs" style={{ color: depthColor }}>{depth}</span>
      <span className="h-3 w-px" style={{ background: 'var(--color-hairline-strong)' }} />
      <span className="num text-[11.5px] tracking-tight" style={{ color: 'var(--color-secondary)' }}>
        {fmtTime(now.toISOString(), tz, true)}{' '}
        <span style={{ color: 'var(--color-quaternary)' }}>{zoneAbbr(tz, now)}</span>
      </span>
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b backdrop-blur-xl"
        style={{ borderColor: 'var(--color-hairline)', background: 'rgba(6,7,10,0.86)' }}>
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-5 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-[6px] text-[11px] font-bold tracking-tight"
              style={{ background: 'linear-gradient(145deg,var(--color-accent),var(--color-accent-dim))', color: '#04120F' }}>
              FJ
            </span>
            <span className="hidden flex-col leading-none sm:flex">
              <span className="text-[13px] font-semibold tracking-tight">FJ Institutional</span>
              <span className="label-xs mt-0.5" style={{ color: 'var(--color-quaternary)' }}>MARKET INTELLIGENCE</span>
            </span>
          </Link>

          <nav className="hidden flex-1 items-center gap-0.5 lg:flex">
            {NAV.map(n => {
              const active = n.href === '/' ? path === '/' : path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href}
                  className={cx(
                    'relative rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-colors',
                    active ? 'text-[var(--color-primary)]' : 'text-[var(--color-tertiary)] hover:text-[var(--color-secondary)]'
                  )}>
                  {n.label}
                  {active && <i className="absolute inset-x-2.5 -bottom-[9px] h-[2px] rounded-full"
                    style={{ background: 'var(--color-accent)' }} />}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <MarketClock />
            <span className="hidden items-center gap-1.5 sm:flex">
              <LiveDot />
              <span className="label-xs" style={{ color: 'var(--color-tertiary)' }}>LIVE</span>
            </span>
            <AuthButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 pb-24 pt-5 sm:px-6 lg:pb-10">{children}</main>

      {/* Mobile nav */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t backdrop-blur-xl lg:hidden"
        style={{ borderColor: 'var(--color-hairline)', background: 'rgba(6,7,10,0.94)' }}>
        <div className="flex">
          {NAV.map(n => {
            const active = n.href === '/' ? path === '/' : path.startsWith(n.href);
            const Icon = n.icon;
            return (
              <Link key={n.href} href={n.href}
                className="flex flex-1 flex-col items-center gap-1 py-2.5"
                style={{ color: active ? 'var(--color-accent)' : 'var(--color-quaternary)' }}>
                <Icon size={16} strokeWidth={2} />
                <span className="text-[9px] font-semibold uppercase tracking-wider">{n.label.split(' ')[0]}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
