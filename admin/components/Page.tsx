'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Gate } from '@/components/Gate';
import { Notice, Shell } from '@/components/Shell';
import { useSession } from '@/lib/session';

/**
 * The frame every section shares: the gate, the chrome, a title, and the two
 * messages a page can ever need to show — what went wrong, and what just
 * worked. Seven pages repeating this by hand is seven chances to get the
 * error handling subtly different on one of them.
 */
export function Page({
  title,
  blurb,
  actions,
  children,
}: {
  title: string;
  blurb?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Gate>
      <Shell>
        <div className="row" style={{ marginBottom: 20 }}>
          <div>
            <h1>{title}</h1>
            {blurb ? (
              <p className="faint" style={{ margin: 0 }}>
                {blurb}
              </p>
            ) : null}
          </div>
          <span className="spacer" />
          {actions}
        </div>
        {children}
      </Shell>
    </Gate>
  );
}

/**
 * Load something, act on it, and reload — with the server's reason surviving
 * the reload.
 *
 * That last part is the whole reason this is shared: setting the reason and
 * then reloading wipes it, because a successful reload clears the error. The
 * cups page had exactly that bug, and it made every refused action look like
 * nothing happening at all.
 *
 * It also waits for a session before asking for anything. Hooks run in the
 * component that declares them, not in the JSX they return — so a page that
 * called this and then wrapped itself in `<Gate>` still fired its first fetch
 * signed out, and every page load answered `permission denied` before quietly
 * succeeding on the retry.
 */
export function useSection<T>(fetch: () => Promise<T>, initial: T) {
  const { session, restoring } = useSession();
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await fetch());
      setError(null);
    } catch (e) {
      setError((e as { message?: string })?.message ?? 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
    // `fetch` is redefined on every render by callers that close over local
    // state, so depending on it here would loop. Callers pass a stable one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (restoring || !session) return;
    void load();
  }, [load, session, restoring]);

  const run = useCallback(
    async (fn: () => Promise<{ ok: boolean; reason?: string }>, said: string) => {
      setBusy(true);
      setNote(null);
      setError(null);
      const res = await fn();
      await load();
      if (!res.ok) setError(res.reason ?? 'That was refused.');
      else setNote(said);
      setBusy(false);
    },
    [load],
  );

  return { data, setData, loading, error, note, busy, load, run, setError };
}

/** The two messages, in the order they should be read. */
export function Messages({ error, note }: { error: string | null; note: string | null }) {
  return (
    <>
      <Notice text={error} />
      <Notice text={note} kind="ok" />
    </>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** EGP, grouped, with no decimals — prices here are always whole pounds. */
export function egp(n: number): string {
  return `EGP ${n.toLocaleString('en-GB')}`;
}

export function when(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
