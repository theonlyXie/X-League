'use client';

import { useCallback, useState } from 'react';
import { canAct } from '@/components/Gate';
import { Empty, Messages, Page, useSection } from '@/components/Page';
import { useSession } from '@/lib/session';
import {
  createReferee,
  referees,
  setRefereeActive,
  setRefereePassword,
  type Referee,
} from '@/lib/admin';

/**
 * The referees.
 *
 * The only account in X League that cannot be created from the app. There is no
 * sign-up for it and no way to ask: the league makes the account here, hands
 * the referee their number and password, and they sign into the ordinary app
 * with them.
 *
 * The password is shown once, at the moment it is set, and then never again —
 * it is stored hashed and cannot be read back. Saying so on the screen is the
 * difference between somebody writing it down now and somebody assuming they
 * can look it up on Saturday morning.
 */
export default function RefereesPage() {
  const { role } = useSession();
  const may = canAct(role);

  const fetch = useCallback(() => referees(), []);
  const { data, loading, error, note, busy, run } = useSection<Referee[]>(fetch, []);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [issued, setIssued] = useState<{ who: string; phone: string; password: string } | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const add = async () => {
    const handed = { who: name.trim(), phone: phone.trim(), password };
    const ok = await run(
      () => createReferee(phone, password, name),
      `${name.trim()} can sign in now.`,
    );
    if (!ok) return;
    setIssued(handed);
    setName('');
    setPhone('');
    setPassword('');
  };

  const reset = async (r: Referee) => {
    const handed = { who: r.displayName, phone: r.phone ?? '', password: newPassword };
    const ok = await run(
      () => setRefereePassword(r.refereeId, newPassword),
      `${r.displayName} has a new password.`,
    );
    if (!ok) return;
    setIssued(handed);
    setResetting(null);
    setNewPassword('');
  };

  return (
    <Page
      title="Referees"
      blurb="Referees are for cups. What a referee records is final: their score is the score, and the two captains do not report over it."
    >
      <Messages error={error} note={note} />

      {issued ? (
        <div className="panel">
          <div className="panel-head">
            <h2>Hand these to {issued.who}</h2>
            <span className="spacer" />
            <button className="small" onClick={() => setIssued(null)}>
              Done
            </button>
          </div>
          <p className="mono" style={{ fontSize: 16, margin: '0 0 8px' }}>
            {issued.phone} · {issued.password}
          </p>
          <p className="faint" style={{ margin: 0 }}>
            This is the only time the password is shown. It is stored hashed and cannot be read
            back — if it is lost, set a new one rather than looking for this.
          </p>
        </div>
      ) : null}

      {may ? (
        <div className="panel">
          <div className="panel-head">
            <h2>Add a referee</h2>
          </div>

          <div className="grid cols-2">
            <div>
              <label htmlFor="ref-name">Name</label>
              <input
                id="ref-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div>
              <label htmlFor="ref-phone">Phone</label>
              <input
                id="ref-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01xxxxxxxxx"
                inputMode="tel"
              />
            </div>
            <div>
              <label htmlFor="ref-password">Password</label>
              <input
                id="ref-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <button
                className="primary"
                disabled={
                  busy || name.trim().length < 2 || phone.trim().length < 8 || password.length < 8
                }
                onClick={() => void add()}
              >
                Create the account
              </button>
              <p className="faint" style={{ marginTop: 8, marginBottom: 0 }}>
                A number that already has an X League account is made a referee rather than given a
                second one, and keeps the password it already had.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <h2>Referees</h2>
          <span className="spacer" />
          <span className="chip">{data.length}</span>
        </div>

        {loading ? (
          <Empty>Loading…</Empty>
        ) : data.length === 0 ? (
          <Empty>No referees yet.</Empty>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Signs in with</th>
                  <th className="num">Matches</th>
                  <th>Added</th>
                  <th>Standing</th>
                  {may ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.refereeId}>
                    <td style={{ fontWeight: 600 }}>{r.displayName}</td>
                    <td className="muted mono">{r.phone ?? '—'}</td>
                    <td className="num">{r.matches}</td>
                    <td className="muted">{new Date(r.createdAt).toLocaleDateString('en-GB')}</td>
                    <td>
                      <span className={r.active ? 'chip gold' : 'chip'}>
                        {r.active ? 'Active' : 'Stood down'}
                      </span>
                    </td>
                    {may ? (
                      <td>
                        {resetting === r.refereeId ? (
                          <div className="row">
                            <input
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="New password"
                            />
                            <button
                              className="primary small"
                              disabled={busy || newPassword.length < 8}
                              onClick={() => void reset(r)}
                            >
                              Set it
                            </button>
                            <button className="small" onClick={() => setResetting(null)}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="row">
                            <button
                              className="small"
                              disabled={busy}
                              onClick={() => {
                                setNewPassword('');
                                setResetting(r.refereeId);
                              }}
                            >
                              New password
                            </button>
                            <button
                              className={r.active ? 'danger small' : 'small'}
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () => setRefereeActive(r.refereeId, !r.active),
                                  r.active
                                    ? `${r.displayName} can no longer record a match.`
                                    : `${r.displayName} can record matches again.`,
                                )
                              }
                            >
                              {r.active ? 'Stand down' : 'Reinstate'}
                            </button>
                          </div>
                        )}
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
