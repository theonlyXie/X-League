'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Gate, canAct } from '@/components/Gate';
import { Notice, Shell, StateChip, dayText, whenText } from '@/components/Shell';
import { useSession } from '@/lib/session';
import {
  decideRegistration,
  generateFixtures,
  recordFixtureResult,
  scheduleFixture,
  setState,
  tournamentBookings,
  tournamentDetail,
  type BookableHour,
  type TournamentDetail,
  type TournamentState,
} from '@/lib/cups';

export default function CupPage() {
  return (
    <Gate>
      <Shell>
        <Cup />
      </Shell>
    </Gate>
  );
}

/** Today in Cairo, which is the day the venue is having. */
function cairoToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
}

function Cup() {
  const { id } = useParams<{ id: string }>();
  const { role } = useSession();
  const may = canAct(role);

  const [cup, setCup] = useState<TournamentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const t = await tournamentDetail(id);
      setCup(t);
      setError(t ? null : 'That cup no longer exists.');
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Every action reports the server's reason and then re-reads the cup.
   *
   * The reload happens *before* the message is set, not after: `load` clears
   * `error` when the cup comes back fine, so setting the reason first meant the
   * reload wiped it and a refused action looked like nothing happening at all.
   */
  const run = async (fn: () => Promise<{ ok: boolean; reason?: string }>, said: string) => {
    setBusy(true);
    setNote(null);
    setError(null);
    const res = await fn();
    await load();
    if (!res.ok) setError(res.reason ?? 'That was refused.');
    else setNote(said);
    setBusy(false);
  };

  if (loading) return <div className="empty">Loading…</div>;
  if (!cup) return <Notice text={error} />;

  const pending = cup.teams.filter((t) => t.state === 'pending');
  const accepted = cup.teams.filter((t) => t.state === 'accepted');

  return (
    <>
      <p className="faint" style={{ marginTop: 0 }}>
        <Link href="/cups">← All cups</Link>
      </p>

      <div className="row" style={{ marginBottom: 20 }}>
        <div>
          <h1>{cup.name}</h1>
          <p className="faint" style={{ margin: 0 }}>
            {cup.venueName}
            {cup.area ? ` · ${cup.area}` : ''} · {cup.format.replace('_', ' + ')} ·{' '}
            {dayText(cup.startsOn)}
            {cup.endsOn ? ` – ${dayText(cup.endsOn)}` : ''}
          </p>
        </div>
        <span className="spacer" />
        <StateChip state={cup.state} />
      </div>

      <Notice text={error} />
      <Notice text={note} kind="ok" />

      {may ? <Lifecycle cup={cup} busy={busy} run={run} /> : null}

      {/* Entries. TRN-004: an entry is a request until somebody decides on it. */}
      <div className="panel">
        <div className="panel-head">
          <h2>Entries</h2>
          <span className="spacer" />
          <span className="chip">
            {accepted.length} of {cup.maxTeams} accepted
          </span>
          {pending.length ? <span className="chip warn">{pending.length} waiting</span> : null}
        </div>

        {cup.teams.length === 0 ? (
          <div className="empty">
            No teams have entered yet.
            {cup.state === 'draft' ? ' Open the cup so captains can enter.' : ''}
          </div>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>State</th>
                  {may ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {cup.teams.map((t) => (
                  <tr key={t.registration_id}>
                    <td style={{ fontWeight: 600 }}>{t.team_name}</td>
                    <td>
                      <span
                        className={`chip ${
                          t.state === 'accepted' ? 'good' : t.state === 'pending' ? '' : 'warn'
                        }`}
                      >
                        {t.state}
                      </span>
                    </td>
                    {may ? (
                      <td className="num">
                        {t.state === 'pending' ? (
                          <span className="row" style={{ justifyContent: 'flex-end' }}>
                            <button
                              className="small primary"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () => decideRegistration(t.registration_id, true),
                                  `${t.team_name} is in.`,
                                )
                              }
                            >
                              Accept
                            </button>
                            <button
                              className="small danger"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () => decideRegistration(t.registration_id, false),
                                  `${t.team_name} was declined.`,
                                )
                              }
                            >
                              Decline
                            </button>
                          </span>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Fixtures cup={cup} may={may} busy={busy} run={run} onReload={load} />

      {/* The table is computed from the fixtures above, never submitted. */}
      <div className="panel">
        <div className="panel-head">
          <h2>Table</h2>
        </div>
        {cup.standings.length === 0 ? (
          <div className="empty">Nothing played yet.</div>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Team</th>
                  <th className="num">P</th>
                  <th className="num">W</th>
                  <th className="num">D</th>
                  <th className="num">L</th>
                  <th className="num">GF</th>
                  <th className="num">GA</th>
                  <th className="num">GD</th>
                  <th className="num">Pts</th>
                </tr>
              </thead>
              <tbody>
                {cup.standings.map((s) => (
                  <tr key={s.team_id}>
                    <td style={{ fontWeight: 600 }}>{s.team_name}</td>
                    <td className="num">{s.played}</td>
                    <td className="num">{s.won}</td>
                    <td className="num">{s.drawn}</td>
                    <td className="num">{s.lost}</td>
                    <td className="num">{s.gf}</td>
                    <td className="num">{s.ga}</td>
                    <td className="num">{s.gd > 0 ? `+${s.gd}` : s.gd}</td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {s.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Draft → open → running → complete, as buttons.
 *
 * Only the transitions that make sense from here are offered. The server
 * accepts any state, so this is a convenience rather than a rule — but a
 * dashboard that offers "complete" on a cup with no fixtures is inviting a
 * mistake it could simply not have offered.
 */
function Lifecycle({
  cup,
  busy,
  run,
}: {
  cup: TournamentDetail;
  busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; reason?: string }>, said: string) => Promise<void>;
}) {
  const go = (state: TournamentState, said: string) => () =>
    void run(() => setState(cup.tournamentId, state), said);

  const played = cup.fixtures.filter((f) => f.state === 'played').length;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Stage</h2>
        <span className="spacer" />
        <span className="faint">
          {cup.entryFeeEgp > 0 ? `Entry ${cup.entryFeeEgp} EGP` : 'Free to enter'}
        </span>
      </div>
      <div className="row">
        {cup.state === 'draft' ? (
          <button className="primary" disabled={busy} onClick={go('open', 'Open for entries.')}>
            Open for entries
          </button>
        ) : null}

        {cup.state === 'open' || cup.state === 'full' ? (
          <>
            <button className="primary" disabled={busy} onClick={go('running', 'The cup is running.')}>
              Close entries and start
            </button>
            <button disabled={busy} onClick={go('draft', 'Back to draft.')}>
              Back to draft
            </button>
          </>
        ) : null}

        {cup.state === 'running' ? (
          <button
            className="primary"
            disabled={busy || played === 0}
            onClick={go('complete', 'The cup is complete.')}
            title={played === 0 ? 'Nothing has been played yet' : undefined}
          >
            Finish the cup
          </button>
        ) : null}

        {cup.state !== 'cancelled' && cup.state !== 'complete' ? (
          <button className="danger" disabled={busy} onClick={go('cancelled', 'The cup is cancelled.')}>
            Cancel
          </button>
        ) : null}

        <span className="spacer" />
        <span className="faint">
          {cup.state === 'draft'
            ? 'Nobody can enter a draft, and players cannot see it.'
            : cup.state === 'open'
              ? 'Captains can enter their teams now.'
              : cup.state === 'running'
                ? 'Draw the fixtures below, then record results as they are played.'
                : ''}
        </span>
      </div>
    </div>
  );
}

function Fixtures({
  cup,
  may,
  busy,
  run,
  onReload,
}: {
  cup: TournamentDetail;
  may: boolean;
  busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; reason?: string }>, said: string) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [scheduling, setScheduling] = useState<string | null>(null);

  const rounds = [...new Set(cup.fixtures.map((f) => f.round))].sort((a, b) => a - b);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Fixtures</h2>
        <span className="spacer" />
        {may && cup.fixtures.length === 0 ? (
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const res = await generateFixtures(cup.tournamentId);
                return res.ok ? { ok: true } : { ok: false, reason: res.reason };
              }, 'The draw is made.')
            }
          >
            Make the draw
          </button>
        ) : null}
      </div>

      {cup.fixtures.length === 0 ? (
        <div className="empty">
          No draw yet. Accept the entries first — the draw is made from the teams that are in.
        </div>
      ) : (
        rounds.map((round) => (
          <div key={round} style={{ marginBottom: 18 }}>
            <p className="eyebrow" style={{ marginBottom: 8 }}>
              Round {round}
            </p>
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>Match</th>
                    <th>Kick-off</th>
                    <th className="num">Score</th>
                    <th>State</th>
                    {may ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {cup.fixtures
                    .filter((f) => f.round === round)
                    .sort((a, b) => a.sequence - b.sequence)
                    .map((f) => (
                      <tr key={f.fixture_id}>
                        <td style={{ fontWeight: 600 }}>
                          {f.home ?? 'TBC'} <span className="muted">v</span> {f.away ?? 'TBC'}
                        </td>
                        <td className="muted">{whenText(f.kicks_off_at)}</td>
                        <td className="num mono">
                          {f.score_home === null ? '—' : `${f.score_home}–${f.score_away}`}
                        </td>
                        <td>
                          <span className={`chip ${f.state === 'played' ? 'good' : ''}`}>
                            {f.state}
                          </span>
                        </td>
                        {may ? (
                          <td className="num">
                            <span className="row" style={{ justifyContent: 'flex-end' }}>
                              {f.state !== 'played' ? (
                                <button
                                  className="small"
                                  disabled={busy}
                                  onClick={() =>
                                    setScheduling(scheduling === f.fixture_id ? null : f.fixture_id)
                                  }
                                >
                                  {f.kicks_off_at ? 'Move' : 'Schedule'}
                                </button>
                              ) : null}
                              {/* The score is read off the match the captain
                                  reported, never typed here — a cup result that
                                  could disagree with the game played is exactly
                                  what record_fixture_result exists to prevent. */}
                              {f.kicks_off_at && f.state !== 'played' ? (
                                <button
                                  className="small primary"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(
                                      () => recordFixtureResult(f.fixture_id),
                                      'Result taken from the match.',
                                    )
                                  }
                                >
                                  Take result
                                </button>
                              ) : null}
                            </span>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {cup.fixtures.some((f) => f.round === round && f.fixture_id === scheduling) ? (
              <SchedulePicker
                tournamentId={cup.tournamentId}
                fixtureId={scheduling!}
                busy={busy}
                onPick={async (bookingId) => {
                  await run(
                    () => scheduleFixture(scheduling!, bookingId),
                    'The fixture has a pitch and an hour.',
                  );
                  setScheduling(null);
                }}
                onCancel={() => setScheduling(null)}
                onReload={onReload}
              />
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

/**
 * A fixture is played at a real booked hour, so scheduling means picking one of
 * the venue's bookings rather than typing a time. `reported` is why this list
 * carries more than ids: a fixture can only be settled once the captain has
 * reported that match, and this is where an organiser sees which are ready.
 */
function SchedulePicker({
  tournamentId,
  fixtureId,
  busy,
  onPick,
  onCancel,
  onReload,
}: {
  tournamentId: string;
  fixtureId: string;
  busy: boolean;
  onPick: (bookingId: string) => Promise<void>;
  onCancel: () => void;
  onReload: () => Promise<void>;
}) {
  const [date, setDate] = useState(cairoToday());
  const [hours, setHours] = useState<BookableHour[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    tournamentBookings(tournamentId, date)
      .then((rows) => {
        if (!cancelled) {
          setHours(rows);
          setError(null);
        }
      })
      .catch((e: { message?: string }) => {
        if (!cancelled) setError(e.message ?? 'Could not load that day.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tournamentId, date, onReload]);

  return (
    <div
      style={{
        marginTop: 10,
        padding: 14,
        borderRadius: 12,
        background: 'var(--bg)',
        border: '1px solid var(--hairline)',
      }}
    >
      <div className="row" style={{ marginBottom: 12 }}>
        <strong style={{ fontSize: 13 }}>Put this fixture on a booked hour</strong>
        <span className="spacer" />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ width: 'auto' }}
        />
        <button className="small" onClick={onCancel}>
          Close
        </button>
      </div>

      <Notice text={error} />

      {loading ? (
        <div className="empty">Loading…</div>
      ) : hours.length === 0 ? (
        <div className="empty">
          Nothing booked at this venue that day. A fixture needs a real booking — book the pitch in
          the app first.
        </div>
      ) : (
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Pitch</th>
                <th>Hour</th>
                <th>Captain</th>
                <th>Match</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {hours.map((h) => (
                <tr key={h.bookingId}>
                  <td>{h.pitchLabel}</td>
                  <td className="muted">{whenText(h.startsAt)}</td>
                  <td className="muted">{h.captainName ?? '—'}</td>
                  <td>
                    {h.reported ? (
                      <span className="chip good">reported</span>
                    ) : (
                      <span className="chip">not reported</span>
                    )}
                  </td>
                  <td className="num">
                    {h.fixtureId && h.fixtureId !== fixtureId ? (
                      <span className="faint">taken</span>
                    ) : (
                      <button
                        className="small primary"
                        disabled={busy}
                        onClick={() => void onPick(h.bookingId)}
                      >
                        Use this
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
