'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Empty, Messages, Page, egp, useSection } from '@/components/Page';
import { overview, type Overview } from '@/lib/admin';

/**
 * What is happening on the platform, in one screen.
 *
 * Every number here comes from `admin_overview` in a single call, so nothing
 * on the page can disagree with anything else on it — a dashboard assembled
 * from six separate queries taken a second apart is a dashboard that
 * occasionally lies about its own totals.
 */
export default function OverviewPage() {
  const [days, setDays] = useState(30);
  const fetch = useCallback(() => overview(days), [days]);
  const { data, loading, error, note, load } = useSection<Overview | null>(fetch, null);

  return (
    <Page
      title="Overview"
      blurb={`The last ${days} days.`}
      actions={
        <select
          value={days}
          onChange={(e) => {
            setDays(Number(e.target.value));
            // The fetch closes over `days`, so the reload has to happen after
            // React has the new value.
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

      {loading ? (
        <Empty>Loading…</Empty>
      ) : !data ? (
        <Empty>Nothing to report yet.</Empty>
      ) : (
        <>
          <div className="tiles">
            <Tile k="Players" v={data.players} />
            <Tile k="Bookings" v={data.bookings} />
            <Tile k="Matches played" v={data.matches} />
            <Tile
              k="Venues"
              v={data.venuesTotal}
              sub={`${data.venuesVerified} verified · ${data.venuesPending} pending`}
            />
          </div>

          <div className="tiles">
            <Tile k="Booked value" v={egp(data.gmvEgp)} />
            <Tile
              k="Collected"
              v={egp(data.collectedEgp)}
              sub={egp(Math.max(0, data.gmvEgp - data.collectedEgp)) + ' still owed'}
            />
            <Tile k="No-show rate" v={`${Math.round(data.noShowRate * 100)}%`} />
            <Tile k="Open reports" v={data.openReports} />
          </div>

          {/* The two things that are somebody's job right now, rather than
              numbers to look at. */}
          <div className="panel">
            <div className="panel-head">
              <h2>Waiting on you</h2>
            </div>
            <div className="row">
              <Link href="/venues">
                <button className={data.venuesPending > 0 ? 'primary' : undefined}>
                  {data.venuesPending > 0
                    ? `${data.venuesPending} venues to verify`
                    : 'No venues waiting'}
                </button>
              </Link>
              <Link href="/reports">
                <button className={data.openReports > 0 ? 'primary' : undefined}>
                  {data.openReports > 0 ? `${data.openReports} open reports` : 'No open reports'}
                </button>
              </Link>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}

function Tile({ k, v, sub }: { k: string; v: string | number; sub?: string }) {
  return (
    <div className="tile">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}
