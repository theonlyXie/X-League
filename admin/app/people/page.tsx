'use client';

import { useCallback, useState } from 'react';
import { canAct } from '@/components/Gate';
import { Empty, Messages, Page, useSection, when } from '@/components/Page';
import { useSession } from '@/lib/session';
import { findUsers, resetPassword, rotateConsolePassword, suspendUser, type User } from '@/lib/admin';

/**
 * Accounts, and the two things that are ever done to one.
 *
 * ADM-010: a suspension is a date rather than a flag, so it expires without
 * anybody remembering to lift it — which is why the control asks for a number
 * of days and zero means "lift it now".
 *
 * The reset is here because there is no SMS provider and no mailbox behind an
 * account's address, so a forgotten password has no self-service route back.
 * Every reset is audited; an admin who can set anybody's password can become
 * anybody.
 */
export default function PeoplePage() {
  const { role } = useSession();
  const may = canAct(role);

  const [query, setQuery] = useState('');
  const fetch = useCallback(() => findUsers(query || undefined), [query]);
  const { data, loading, error, note, busy, load, run } = useSection<User[]>(fetch, []);

  const search = () => setTimeout(() => void load(), 0);

  return (
    <Page title="People" blurb="Find an account, suspend it, or let somebody back in.">
      <Messages error={error} note={note} />

      <div className="panel">
        <div className="row">
          <input
            placeholder="Name, or leave empty for everyone"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            aria-label="Search people"
            style={{ maxWidth: 340 }}
          />
          <button onClick={search} disabled={busy}>
            Search
          </button>
        </div>
      </div>

      <div className="panel">
        {loading ? (
          <Empty>Loading…</Empty>
        ) : data.length === 0 ? (
          <Empty>Nobody found.</Empty>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Area</th>
                  <th className="num">Bookings</th>
                  <th className="num">No-shows</th>
                  <th>Joined</th>
                  <th>State</th>
                  {may ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {data.map((u) => (
                  <PersonRow key={u.playerId} u={u} may={may} busy={busy} run={run} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Page>
  );
}

function PersonRow({
  u,
  may,
  busy,
  run,
}: {
  u: User;
  may: boolean;
  busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; reason?: string }>, said: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(7);
  const [password, setPassword] = useState('');
  /** Shown once, right after a rotation. Never fetched again — it cannot be. */
  const [code, setCode] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);

  const suspended = u.suspendedUntil && new Date(u.suspendedUntil) > new Date();

  return (
    <>
      <tr>
        <td style={{ fontWeight: 600 }}>
          {u.displayName}
          {u.consoleRole ? (
            <span className="chip" style={{ marginLeft: 8 }}>
              {u.consoleRole}
            </span>
          ) : null}
        </td>
        <td className="muted">{u.area ?? '—'}</td>
        <td className="num">{u.bookings}</td>
        <td className="num">{u.noShows}</td>
        <td className="muted">{when(u.joined)}</td>
        <td>
          {suspended ? (
            <span className="chip warn">until {when(u.suspendedUntil)}</span>
          ) : (
            <span className="chip good">active</span>
          )}
        </td>
        {may ? (
          <td className="num">
            <button className="small" onClick={() => setOpen((o) => !o)}>
              {open ? 'Close' : 'Manage'}
            </button>
          </td>
        ) : null}
      </tr>

      {may && open ? (
        <tr>
          <td colSpan={7} style={{ background: 'var(--bg)' }}>
            <div className="row" style={{ gap: 18 }}>
              <div className="row">
                <label htmlFor={`d-${u.playerId}`} style={{ margin: 0 }}>
                  Suspend for
                </label>
                <input
                  id={`d-${u.playerId}`}
                  type="number"
                  min={0}
                  max={365}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  style={{ width: 80 }}
                />
                <span className="faint">days</span>
                <button
                  className="small danger"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => suspendUser(u.playerId, days),
                      days === 0
                        ? `${u.displayName} is active again.`
                        : `${u.displayName} is suspended for ${days} days.`,
                    )
                  }
                >
                  Apply
                </button>
                {suspended ? (
                  <button
                    className="small"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => suspendUser(u.playerId, 0),
                        `${u.displayName} is active again.`,
                      )
                    }
                  >
                    Lift now
                  </button>
                ) : null}
              </div>

              <div className="row">
                <label htmlFor={`p-${u.playerId}`} style={{ margin: 0 }}>
                  New password
                </label>
                <input
                  id={`p-${u.playerId}`}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ width: 190 }}
                />
                <button
                  className="small"
                  disabled={busy || password.length < 8}
                  onClick={() =>
                    void run(() => resetPassword(u.playerId, password), 'Password reset.').then(
                      () => setPassword(''),
                    )
                  }
                >
                  Reset
                </button>
                <span className="faint">Audited. Tell them in person, not in writing.</span>
              </div>

              {/*
                Rotation is a different job from the reset above, and the
                difference is who ends up knowing the password: after a reset,
                you do. This sets one nobody will ever see and hands back a
                single-use code instead, which is what a leaked password needs.

                Offered only on console accounts. The `Su` recovery flow
                resolves a username through an active platform role, so anybody
                else would be locked out with no route back — the server refuses
                it, and there is no reason to show a control that will be.
              */}
              {u.consoleRole ? (
                <div className="row" style={{ gap: 10, width: '100%' }}>
                  <button
                    className="small danger"
                    disabled={busy || rotating}
                    onClick={async () => {
                      setRotating(true);
                      setCode(null);
                      const res = await rotateConsolePassword(u.playerId);
                      setRotating(false);
                      if (res.ok) setCode(res.recoveryCode);
                      else window.alert(res.reason);
                    }}
                  >
                    {rotating ? 'Rotating…' : 'Rotate password'}
                  </button>
                  <span className="faint">
                    Kills the current password immediately. Nobody sees the new one — they get back
                    in with the code below.
                  </span>
                </div>
              ) : null}

              {code ? (
                <div
                  className="row"
                  style={{
                    gap: 10,
                    padding: '10px 12px',
                    border: '1px solid var(--gold, #b08f35)',
                    borderRadius: 8,
                    width: '100%',
                  }}
                >
                  <strong>Recovery code</strong>
                  <code style={{ fontSize: 15, letterSpacing: 1 }}>{code}</code>
                  <button
                    className="small"
                    onClick={() => void navigator.clipboard?.writeText(code)}
                  >
                    Copy
                  </button>
                  <span className="faint">
                    Shown once — it is stored hashed and cannot be read again. Give it to{' '}
                    {u.displayName} to sign in with <code>Su</code>, and they choose their own
                    password. Any earlier code for this account has stopped working.
                  </span>
                </div>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
