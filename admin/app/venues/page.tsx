'use client';

import { useCallback, useState } from 'react';
import { canAct } from '@/components/Gate';
import { Empty, Messages, Page, useSection, when } from '@/components/Page';
import { useSession } from '@/lib/session';
import {
  allVenues,
  createVenue,
  setVerification,
  verificationQueue,
  type PendingVenue,
  type Venue,
} from '@/lib/admin';

/**
 * Every venue, and the ones waiting to be verified.
 *
 * VEN-006: verification is what players are shown, so it is a decision rather
 * than a formality — a venue somebody registered from the app is listed and
 * marked unverified until this page says otherwise.
 */
export default function VenuesPage() {
  const { role } = useSession();
  const may = canAct(role);

  const fetch = useCallback(
    async () => ({ queue: await verificationQueue(), all: await allVenues() }),
    [],
  );
  const { data, loading, error, note, busy, run } = useSection<{
    queue: PendingVenue[];
    all: Venue[];
  }>(fetch, { queue: [], all: [] });

  const decide = (v: PendingVenue, verification: string) =>
    void run(
      () => setVerification(v.venueId, verification),
      `${v.name} is now ${verification}.`,
    );

  return (
    <Page title="Venues" blurb="Add a ground, verify what players are shown, and see every venue on the platform.">
      <Messages error={error} note={note} />

      {may ? <AddVenue busy={busy} run={run} /> : null}

      <div className="panel">
        <div className="panel-head">
          <h2>Waiting to be verified</h2>
          <span className="spacer" />
          <span className="chip">{data.queue.length}</span>
        </div>

        {loading ? (
          <Empty>Loading…</Empty>
        ) : data.queue.length === 0 ? (
          <Empty>Nothing waiting.</Empty>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Venue</th>
                  <th>Area</th>
                  <th>Contact</th>
                  <th className="num">Pitches</th>
                  <th className="num">Bookings</th>
                  <th>Registered</th>
                  {may ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {data.queue.map((v) => (
                  <tr key={v.venueId}>
                    <td style={{ fontWeight: 600 }}>{v.name}</td>
                    <td className="muted">{v.area ?? '—'}</td>
                    <td className="muted mono">{v.phone ?? '—'}</td>
                    <td className="num">{v.pitches}</td>
                    <td className="num">{v.bookings}</td>
                    <td className="muted">{when(v.createdAt)}</td>
                    {may ? (
                      <td className="num">
                        <span className="row" style={{ justifyContent: 'flex-end' }}>
                          <button
                            className="small primary"
                            disabled={busy}
                            onClick={() => decide(v, 'verified')}
                          >
                            Verify
                          </button>
                          <button
                            className="small danger"
                            disabled={busy}
                            onClick={() => decide(v, 'unverified')}
                          >
                            Reject
                          </button>
                        </span>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>All venues</h2>
          <span className="spacer" />
          <span className="chip">{data.all.length}</span>
        </div>

        {loading ? (
          <Empty>Loading…</Empty>
        ) : data.all.length === 0 ? (
          <Empty>No venues yet. One appears here as soon as somebody registers it.</Empty>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Venue</th>
                  <th>Area</th>
                  <th className="num">Pitches</th>
                  <th>Verification</th>
                  {may ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {data.all.map((v) => (
                  <tr key={v.venueId}>
                    <td style={{ fontWeight: 600 }}>{v.name}</td>
                    <td className="muted">{v.area ?? '—'}</td>
                    <td className="num">{v.pitches}</td>
                    <td>
                      <span className={`chip ${v.verification === 'verified' ? 'good' : ''}`}>
                        {v.verification}
                      </span>
                    </td>
                    {may ? (
                      <td className="num">
                        {v.verification === 'verified' ? (
                          <button
                            className="small danger"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () => setVerification(v.venueId, 'unverified'),
                                `${v.name} is no longer verified.`,
                              )
                            }
                          >
                            Withdraw
                          </button>
                        ) : (
                          <button
                            className="small"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () => setVerification(v.venueId, 'verified'),
                                `${v.name} is verified.`,
                              )
                            }
                          >
                            Verify
                          </button>
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

/**
 * A ground the league arranges itself.
 *
 * Every venue here used to arrive one way: somebody signed up as its owner in
 * the app. That is the wrong shape for how this league actually works — most
 * grounds are agreed on the phone, and the person agreeing them is the one
 * sitting in front of this console. It arrives verified, with a pitch, a week
 * of hours and a price, so it can take a booking the moment it is saved; the
 * owner's own account can be attached later by them signing up.
 */
function AddVenue({
  busy,
  run,
}: {
  busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; reason?: string }>, said: string) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [phone, setPhone] = useState('');

  const ready = name.trim().length >= 2 && area.trim().length >= 2;

  const save = () =>
    void run(async () => {
      const res = await createVenue(name.trim(), area.trim(), phone);
      if (res.ok) {
        setName('');
        setArea('');
        setPhone('');
      }
      return res.ok ? { ok: true } : { ok: false, reason: res.reason };
    }, `${name.trim()} is added and waiting to be verified. Approve it in the queue above and it goes live.`);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Add a venue</h2>
      </div>
      <div className="grid cols-2">
        <div>
          <label htmlFor="venue-name">Name</label>
          <input
            id="venue-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Stadium One"
          />
        </div>
        <div>
          <label htmlFor="venue-area">Area</label>
          <input
            id="venue-area"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="Nasr City"
          />
        </div>
        <div>
          <label htmlFor="venue-phone">Phone (optional)</label>
          <input
            id="venue-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+20 100 000 0000"
          />
        </div>
        <div className="row" style={{ gridColumn: '1 / -1' }}>
          <button className="primary" disabled={!ready || busy} onClick={save}>
            Add the venue
          </button>
          <span className="faint">
            One pitch to begin with, open every day 10:00&ndash;24:00 at 300 EGP. It arrives in the
            queue above &mdash; nothing reaches players until it is verified.
          </span>
        </div>
      </div>
    </div>
  );
}
