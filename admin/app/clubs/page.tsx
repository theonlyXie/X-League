'use client';

import { useCallback, useState } from 'react';
import { canAct } from '@/components/Gate';
import { Empty, Messages, Page, useSection } from '@/components/Page';
import { useSession } from '@/lib/session';
import { clubQueue, setClubVerification, type PendingClub } from '@/lib/admin';

/**
 * Which clubs are in the league.
 *
 * A club used to exist the moment somebody typed a name, and counted from that
 * moment — it could enter competitions, take a trophy and appear in the tables
 * without anybody agreeing it was a real side. This is the decision that was
 * missing. Rejecting keeps the club's rows, so it is reversible and the name
 * stays taken; nothing here deletes anybody's squad.
 */
export default function ClubsPage() {
  const { role } = useSession();
  const may = canAct(role);
  const [state, setState] = useState('pending');

  const fetch = useCallback(() => clubQueue(state), [state]);
  const { data, loading, error, note, busy, run } = useSection<PendingClub[]>(fetch, []);

  const decide = (c: PendingClub, verification: string) =>
    void run(
      () => setClubVerification(c.clubId, verification),
      verification === 'verified'
        ? `${c.name} is admitted. Its captain has been told.`
        : verification === 'rejected'
          ? `${c.name} was not admitted. Its captain has been told.`
          : `${c.name} is back in the queue.`,
    );

  return (
    <Page
      title="Clubs"
      blurb="A club is admitted by X League, not by founding itself. Until it is, it can build a squad but cannot enter anything."
    >
      <Messages error={error} note={note} />

      <div className="panel">
        <div className="panel-head">
          <h2>
            {state === 'pending'
              ? 'Waiting to be admitted'
              : state === 'verified'
                ? 'In the league'
                : 'Not admitted'}
          </h2>
          <span className="spacer" />
          <span className="chip">{data.length}</span>
          <div className="row">
            {(['pending', 'verified', 'rejected'] as const).map((s) => (
              <button
                key={s}
                className={s === state ? 'primary small' : 'small'}
                onClick={() => setState(s)}
              >
                {s === 'pending' ? 'Waiting' : s === 'verified' ? 'Admitted' : 'Refused'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <Empty>Loading…</Empty>
        ) : data.length === 0 ? (
          <Empty>
            {state === 'pending' ? 'Nothing waiting.' : 'None.'}
          </Empty>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Club</th>
                  <th>Home</th>
                  <th>Captain</th>
                  <th>Contact</th>
                  <th className="num">Squad</th>
                  <th>Founded</th>
                  {may ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.clubId}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td className="muted">{c.homeArea ?? '—'}</td>
                    <td className="muted">{c.captainName}</td>
                    <td className="muted mono">{c.captainPhone ?? '—'}</td>
                    <td className="num">{c.members}</td>
                    <td className="muted">{new Date(c.createdAt).toLocaleDateString('en-GB')}</td>
                    {may ? (
                      <td>
                        <div className="row">
                          {c.verification !== 'verified' ? (
                            <button
                              className="primary small"
                              disabled={busy}
                              onClick={() => decide(c, 'verified')}
                            >
                              Admit
                            </button>
                          ) : null}
                          {c.verification !== 'rejected' ? (
                            <button
                              className="danger small"
                              disabled={busy}
                              onClick={() => decide(c, 'rejected')}
                            >
                              Refuse
                            </button>
                          ) : null}
                          {c.verification !== 'pending' ? (
                            <button
                              className="small"
                              disabled={busy}
                              onClick={() => decide(c, 'pending')}
                            >
                              Back to queue
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Page>
  );
}
