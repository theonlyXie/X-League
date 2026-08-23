'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useSession } from '@/lib/session';

export function Shell({ children }: { children: ReactNode }) {
  const { role, signOut } = useSession();
  return (
    <div className="shell">
      <div className="topbar">
        <Link href="/cups" className="brand">
          <span className="brand-mark">X</span>
          <span>X League — Admin</span>
        </Link>
        <span className="spacer" />
        {role ? <span className="chip gold">{role}</span> : null}
        <button className="small" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
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
