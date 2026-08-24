'use client';

import { useCallback } from 'react';
import { canAct } from '@/components/Gate';
import { Empty, Messages, Page, useSection, when } from '@/components/Page';
import { useSession } from '@/lib/session';
import { allVenues, setVerification, verificationQueue, type PendingVenue, type Venue } from '@/lib/admin';

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
    <Page title="Venues" blurb="Verify what players are shown, and see every venue on the platform.">
      <Messages error={error} note={note} />

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
