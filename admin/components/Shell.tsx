'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useSession } from '@/lib/session';

/**
 * The sections, in the order somebody running the platform works through them:
 * what is happening, then what needs a decision, then the record.
 */
const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/venues', label: 'Venues' },
  { href: '/people', label: 'People' },
  { href: '/reports', label: 'Reports' },
  { href: '/cups', label: 'Cups' },
  { href: '/money', label: 'Money' },
  { href: '/settings', label: 'Settings' },
  { href: '/audit', label: 'Audit' },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const { role, signOut } = useSession();
  const path = usePathname();

  return (
    <div className="shell">
      <div className="topbar">
        <Link href="/" className="brand">
          <span className="brand-mark">X</span>
          <span>X League — Admin</span>
        </Link>
        <span className="spacer" />
        {role ? <span className="chip gold">{role}</span> : null}
        <button className="small" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>

      <nav className="nav">
        {NAV.map((n) => {
          // `/` only matches exactly; everything else matches its subtree, so
          // a cup's own page keeps Cups lit.
          const on = n.href === '/' ? path === '/' : path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={on ? 'nav-on' : undefined}>
              {n.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}

/** A refused call says why, in the server's own words. */
export function Notice({ text, kind = 'error' }: { text: string | null; kind?: 'error' | 'ok' }) {
  if (!text) return null;
  return <div className={`notice ${kind}`}>{text}</div>;
}

export function StateChip({ state }: { state: string }) {
  const tone =
    state === 'running' || state === 'open'
      ? 'good'
      : state === 'cancelled'
        ? 'warn'
        : state === 'complete'
          ? 'gold'
          : '';
  return <span className={`chip ${tone}`}>{state}</span>;
}

/** Dates are shown in the venue's zone, because that is where the match is. */
export function whenText(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function dayText(date: string | null): string {
  if (!date) return '—';
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
