'use client';

import { useCallback, useState } from 'react';
import { Empty, Messages, Page, egp, useSection } from '@/components/Page';
import { ledger, type LedgerRow } from '@/lib/admin';

/**
 * What each venue booked, took, and is still owed.
 *
 * Nothing is taken up front any more, so "collected" means money that changed
 * hands at the venue and somebody recorded. Outstanding is the gap — bookings
 * that happened and were never marked paid, which is the number worth chasing.
 */
export default function MoneyPage() {
  const [days, setDays] = useState(30);
  const fetch = useCallback(() => ledger(days), [days]);
  const { data, loading, error, note, load } = useSection<LedgerRow[]>(fetch, []);

  const total = (pick: (r: LedgerRow) => number) => data.reduce((s, r) => s + pick(r), 0);

  return (
    <Page
      title="Money"
      blurb={`Booked, collected and outstanding over the last ${days} days.`}
      actions={
        <select
          value={days}
          onChange={(e) => {
            setDays(Number(e.target.value));
            setTimeout(() => void load(), 0);
          }}
          style={{ width: 'auto' }}
          aria-label="Period"
        >
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
      }
    >
      <Messages error={error} note={note} />

      {!loading && data.length > 0 ? (
        <div className="tiles">
          <div className="tile">
            <div className="k">Booked</div>
            <div className="v">{egp(total((r) => r.grossEgp))}</div>
          </div>
          <div className="tile">
            <div className="k">Collected</div>
            <div className="v">{egp(total((r) => r.collectedEgp))}</div>
          </div>
          <div className="tile">
            <div className="k">Outstanding</div>
            <div className="v">{egp(total((r) => r.outstandingEgp))}</div>
          </div>
        </div>
      ) : null}

      <div className="panel">
        {loading ? (
          <Empty>Loading…</Empty>
        ) : data.length === 0 ? (
          <Empty>No bookings in this period.</Empty>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Venue</th>
                  <th className="num">Bookings</th>
                  <th className="num">Booked</th>
                  <th className="num">Collected</th>
                  <th className="num">Outstanding</th>
                  <th className="num">Forfeited</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.venueId}>
                    <td style={{ fontWeight: 600 }}>{r.venueName}</td>
                    <td className="num">{r.bookings}</td>
                    <td className="num">{egp(r.grossEgp)}</td>
                    <td className="num">{egp(r.collectedEgp)}</td>
                    <td className="num">{egp(r.outstandingEgp)}</td>
                    <td className="num">{egp(r.forfeitedEgp)}</td>
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
