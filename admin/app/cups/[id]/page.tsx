'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Gate, canAct } from '@/components/Gate';
import { Notice, Shell, StateChip, cairoInstant, dayText, whenText } from '@/components/Shell';
import { useSession } from '@/lib/session';
import {
  addTournamentVenue,
  adminVenues,
  deletePaymentChannel,
  decideRegistration,
  generateFixtures,
  placeFixture,
  recordFixtureResult,
  removeTournamentVenue,
  scheduleFixture,
  paymentChannels,
  savePaymentChannel,
  setRegion,
  setRegistrationPaid,
  setState,
  settleTournament,
  tournamentAwards,
  tournamentBookings,
  tournamentDetail,
  tournamentEntries,
  tournamentPitches,
  type Award,
  type BookableHour,
  type CupPitch,
  type Entry,
  type Venue,
  type PaymentChannel,
  type PaymentChannelKind,
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
  const [entries, setEntries] = useState<Entry[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      // Three calls rather than one because they fail for different reasons: a
      // cup that has not been settled has no awards, and an organiser who may
      // read the cup may still be refused its money.
      const [t, rows, won, money] = await Promise.all([
        tournamentDetail(id),
        tournamentEntries(id).catch(() => [] as Entry[]),
        tournamentAwards(id).catch(() => [] as Award[]),
        paymentChannels().catch(() => [] as PaymentChannel[]),
      ]);
      setCup(t);
      setEntries(rows);
      setAwards(won);
      setChannels(money);
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

  const pending = entries.filter((e) => e.state === 'pending');
  const accepted = entries.filter((e) => e.state === 'accepted');

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

      {may ? <Lifecycle cup={cup} awards={awards.length} busy={busy} run={run} /> : null}

      <Grounds cup={cup} may={may} busy={busy} run={run} />

      <Money
        cup={cup}
        channels={channels}
        may={may}
        busy={busy}
        run={run}
      />

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

        {entries.length === 0 ? (
          <div className="empty">
            Nobody has entered yet.
            {cup.state === 'draft' ? ' Open the cup so captains can enter.' : ''}
          </div>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Entrant</th>
                  <th>State</th>
                  <th className="num">Due</th>
                  <th>Payment</th>
                  {may ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.registrationId}>
                    <td style={{ fontWeight: 600 }}>
                      {e.entrantName}
                      {e.clubId ? <span className="chip" style={{ marginLeft: 8 }}>club</span> : null}
                    </td>
                    <td>
                      <span
                        className={`chip ${
                          e.state === 'accepted' ? 'good' : e.state === 'pending' ? '' : 'warn'
                        }`}
                      >
                        {e.state}
                      </span>
                    </td>
                    <td className="num">
                      {e.amountDueEgp} EGP
                      {e.promoOffEgp > 0 || e.pointsOffEgp > 0 ? (
                        <div className="faint" style={{ fontSize: 11 }}>
                          {e.feeEgp} less{e.promoOffEgp > 0 ? ` ${e.promoOffEgp} code` : ''}
                          {e.pointsOffEgp > 0 ? ` ${e.pointsOffEgp} points` : ''}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {e.paid ? (
                        <span className="chip good">paid</span>
                      ) : e.paymentClaimedAt ? (
                        <span className="chip warn">claimed</span>
                      ) : (
                        <span className="faint">nothing said</span>
                      )}
                      {e.paymentNote ? (
                        <div className="faint" style={{ fontSize: 11 }}>{e.paymentNote}</div>
                      ) : null}
                    </td>
                    {may ? (
                      <td className="num">
                        <span className="row" style={{ justifyContent: 'flex-end' }}>
                          <button
                            className="small"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () => setRegistrationPaid(e.registrationId, !e.paid),
                                e.paid
                                  ? `${e.entrantName} marked unpaid.`
                                  : `${e.entrantName}'s payment recorded.`,
                              )
                            }
                          >
                            {e.paid ? 'Unmark paid' : 'Mark paid'}
                          </button>
                          {e.state === 'pending' ? (
                            <>
                              <button
                                className="small primary"
                                disabled={busy}
                                onClick={() =>
                                  void run(
                                    () => decideRegistration(e.registrationId, true),
                                    `${e.entrantName} is in.`,
                                  )
                                }
                              >
                                Admit
                              </button>
                              <button
                                className="small danger"
                                disabled={busy}
                                onClick={() =>
                                  void run(
                                    () => decideRegistration(e.registrationId, false),
                                    `${e.entrantName} was declined.`,
                                  )
                                }
                              >
                                Decline
                              </button>
                            </>
                          ) : null}
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

      {awards.length ? (
        <div className="panel">
          <div className="panel-head">
            <h2>Roll of honour</h2>
          </div>
          <div className="scroll-x">
            <table>
              <tbody>
                {awards.map((a) => (
                  <tr key={a.kind}>
                    <td className="faint" style={{ width: 160 }}>{a.kind.replace('_', ' ')}</td>
                    <td style={{ fontWeight: 600 }}>{a.displayName}</td>
                    <td className="num">
                      {a.value != null ? a.value : ''}
                      {a.note ? <div className="faint" style={{ fontSize: 11 }}>{a.note}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

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
                  <tr key={s.entrant_id}>
                    <td style={{ fontWeight: 600 }}>{s.entrant_name}</td>
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
  awards,
  busy,
  run,
}: {
  cup: TournamentDetail;
  awards: number;
  busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; reason?: string }>, said: string) => Promise<void>;
}) {
  const [region, setRegionText] = useState('');
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

        {/* Settling is not the same as finishing. Finishing changes the state;
            settling writes down who won, which trophy the club keeps, and the
            four awards — and it reads the standings the cup has been showing
            rather than recomputing, so the table and the trophy agree. */}
        {cup.state !== 'draft' && cup.state !== 'cancelled' && awards === 0 ? (
          <button
            className="primary"
            disabled={busy || played === 0}
            title={played === 0 ? 'Nothing has been played yet' : undefined}
            onClick={() =>
              void run(async () => {
                const res = await settleTournament(cup.tournamentId);
                return res.ok ? { ok: true } : { ok: false, reason: res.reason };
              }, 'Settled. The champion and the awards are recorded.')
            }
          >
            Settle and award
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
              ? 'Captains can enter their clubs now.'
              : cup.state === 'running'
                ? 'Draw the fixtures below, then record results as they are played.'
                : ''}
        </span>
      </div>

      {/* Where the cup is, for players filtering by place. Empty means "wherever
          the venue is", which is right for almost every cup and why this is not
          a required field on creation. */}
      <div className="row" style={{ marginTop: 14 }}>
        <input
          value={region}
          onChange={(e) => setRegionText(e.target.value)}
          placeholder={cup.area ? `Place — defaults to ${cup.area}` : 'Place, e.g. Giza'}
          style={{ maxWidth: 280 }}
        />
        <button
          disabled={busy}
          onClick={() =>
            void run(
              () => setRegion(cup.tournamentId, region.trim() || null),
              region.trim() ? `Listed under ${region.trim()}.` : 'Back to the venue\u2019s own area.',
            )
          }
        >
          Set place
        </button>
      </div>
    </div>
  );
}

/**
 * The grounds a cup is played on.
 *
 * A cup in Giza is not at one pitch — it is spread across the grounds an
 * organiser could get for the weekend, and each match may be at a different
 * one. The host is the ground the cup was created at: it is what decides who
 * may run the cup, so it stays and cannot be dropped.
 */
function Grounds({
  cup,
  may,
  busy,
  run,
}: {
  cup: TournamentDetail;
  may: boolean;
  busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; reason?: string }>, said: string) => Promise<void>;
}) {
  const [all, setAll] = useState<Venue[] | null>(null);
  const [picked, setPicked] = useState('');

  useEffect(() => {
    if (!may) return;
    // Support-level and above can read the venue list. A venue manager running
    // their own cup cannot, and the panel says so rather than showing an empty
    // dropdown that looks like there are no venues in the country.
    adminVenues()
      .then(setAll)
      .catch(() => setAll([]));
  }, [may]);

  const already = new Set(cup.venues.map((v) => v.venue_id));
  const addable = (all ?? []).filter((v) => !already.has(v.venueId));

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Grounds</h2>
        <span className="spacer" />
        <span className="chip">
          {cup.venues.length} {cup.venues.length === 1 ? 'ground' : 'grounds'}
        </span>
      </div>

      <div className="scroll-x">
        <table>
          <thead>
            <tr>
              <th>Ground</th>
              <th>Area</th>
              <th className="num">Matches here</th>
              {may ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {cup.venues.map((v) => {
              const here = cup.fixtures.filter((f) => f.venue_name === v.name).length;
              return (
                <tr key={v.venue_id}>
                  <td style={{ fontWeight: 600 }}>
                    {v.name}
                    {v.is_host ? (
                      <span className="chip gold" style={{ marginLeft: 8 }}>
                        host
                      </span>
                    ) : null}
                  </td>
                  <td className="muted">{v.area ?? '—'}</td>
                  <td className="num">{here}</td>
                  {may ? (
                    <td className="num">
                      {v.is_host ? (
                        <span className="faint">stays</span>
                      ) : (
                        <button
                          className="small danger"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => removeTournamentVenue(cup.tournamentId, v.venue_id),
                              `${v.name} is no longer one of the grounds.`,
                            )
                          }
                        >
                          Drop
                        </button>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {may ? (
        <div className="row" style={{ marginTop: 12 }}>
          {all === null ? (
            <span className="faint">Loading the venue list…</span>
          ) : addable.length === 0 ? (
            <span className="faint">
              {all.length === 0
                ? 'Adding a ground needs the platform venue list, which only platform staff can read.'
                : 'Every venue is already one of this cup\u2019s grounds.'}
            </span>
          ) : (
            <>
              <select
                value={picked}
                onChange={(e) => setPicked(e.target.value)}
                style={{ maxWidth: 320 }}
              >
                <option value="">Add another ground…</option>
                {addable.map((v) => (
                  <option key={v.venueId} value={v.venueId}>
                    {v.name}
                    {v.area ? ` · ${v.area}` : ''} · {v.pitches}{' '}
                    {v.pitches === 1 ? 'pitch' : 'pitches'}
                  </option>
                ))}
              </select>
              <button
                className="primary"
                disabled={busy || !picked}
                onClick={() => {
                  const name = addable.find((v) => v.venueId === picked)?.name ?? 'That ground';
                  void run(async () => {
                    const res = await addTournamentVenue(cup.tournamentId, picked);
                    if (res.ok) setPicked('');
                    return res;
                  }, `${name} is now one of the grounds.`);
                }}
              >
                Add
              </button>
            </>
          )}
        </div>
      ) : null}
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
                    <th>Where</th>
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
                        <td className="muted">
                          {f.venue_name ? (
                            <>
                              {f.venue_name}
                              {f.pitch_label ? (
                                <span className="faint"> · {f.pitch_label}</span>
                              ) : null}
                            </>
                          ) : (
                            <span className="faint">not placed</span>
                          )}
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
                                  {f.kicks_off_at ? 'Move' : 'Place'}
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
              <PlacePicker
                tournamentId={cup.tournamentId}
                fixtureId={scheduling!}
                busy={busy}
                onPlace={async (pitchId, whenIso) => {
                  await run(
                    () => placeFixture(scheduling!, pitchId, whenIso),
                    'The match has a ground and an hour.',
                  );
                  setScheduling(null);
                }}
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
 * Where and when a match is played.
 *
 * Two ways in, because there are two ways a pitch is actually got. An organiser
 * running a cup across a city has agreed four grounds for a Saturday by phone;
 * there is no booking to point at, and making them invent one would be asking
 * them to lie about how the hour was arranged. So the first tab places the
 * match at any pitch of any ground the cup is played on, at an hour they type.
 *
 * The second is the original: a real booking at the host venue, which is right
 * when the cup is buying pitch-hours through the app. `reported` is why that
 * list carries more than ids — a fixture can only be settled once the captain
 * has reported that match, and this is where an organiser sees which are ready.
 */
function PlacePicker({
  tournamentId,
  fixtureId,
  busy,
  onPlace,
  onPick,
  onCancel,
  onReload,
}: {
  tournamentId: string;
  fixtureId: string;
  busy: boolean;
  onPlace: (pitchId: string, whenIso: string) => Promise<void>;
  onPick: (bookingId: string) => Promise<void>;
  onCancel: () => void;
  onReload: () => Promise<void>;
}) {
  const [mode, setMode] = useState<'ground' | 'booking'>('ground');
  const [pitches, setPitches] = useState<CupPitch[] | null>(null);
  const [pitch, setPitch] = useState('');
  const [day, setDay] = useState(cairoToday());
  const [time, setTime] = useState('18:00');
  const [date, setDate] = useState(cairoToday());
  const [hours, setHours] = useState<BookableHour[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tournamentPitches(tournamentId)
      .then(setPitches)
      .catch(() => setPitches([]));
  }, [tournamentId]);

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
        <strong style={{ fontSize: 13 }}>Where and when is this match?</strong>
        <span className="spacer" />
        <button
          className={`small ${mode === 'ground' ? 'primary' : ''}`}
          onClick={() => setMode('ground')}
        >
          A ground and an hour
        </button>
        <button
          className={`small ${mode === 'booking' ? 'primary' : ''}`}
          onClick={() => setMode('booking')}
        >
          A booked hour
        </button>
        <button className="small" onClick={onCancel}>
          Close
        </button>
      </div>

      {mode === 'ground' ? (
        pitches === null ? (
          <div className="empty">Loading the grounds…</div>
        ) : pitches.length === 0 ? (
          <div className="empty">
            None of this cup&rsquo;s grounds has a pitch on it. Add the pitches to the venue first,
            or add a ground that has some.
          </div>
        ) : (
          <>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <select
                value={pitch}
                onChange={(e) => setPitch(e.target.value)}
                style={{ maxWidth: 340 }}
              >
                <option value="">Pick a pitch…</option>
                {[...new Set(pitches.map((p) => p.venueName))].map((venueName) => (
                  <optgroup key={venueName} label={venueName}>
                    {pitches
                      .filter((p) => p.venueName === venueName)
                      .map((p) => (
                        <option key={p.pitchId} value={p.pitchId}>
                          {p.label}
                          {p.isHost ? ' · host' : ''}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <input
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                style={{ width: 'auto' }}
              />
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                style={{ width: 'auto' }}
              />
              <button
                className="primary"
                disabled={busy || !pitch || !day || !time}
                onClick={() => void onPlace(pitch, cairoInstant(day, time))}
              >
                Place it
              </button>
            </div>
            <p className="faint" style={{ marginTop: 8, marginBottom: 0 }}>
              Times are Cairo&rsquo;s, wherever you are reading this.
            </p>
          </>
        )
      ) : null}

      {mode === 'booking' ? (
        <>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="faint">Bookings at the host venue</span>
        <span className="spacer" />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ width: 'auto' }}
        />
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
        </>
      ) : null}
    </div>
  );
}

const KINDS: { value: PaymentChannelKind; label: string; hint: string }[] = [
  { value: 'instapay', label: 'InstaPay', hint: 'Handle or address' },
  { value: 'bank', label: 'Bank transfer', hint: 'Account number or IBAN' },
  { value: 'wallet', label: 'Mobile wallet', hint: 'Number' },
  { value: 'contact', label: 'Call to arrange', hint: 'Number to call' },
];

/**
 * Where this cup's entry money goes.
 *
 * On the cup's own page rather than only on the shared settings page, because
 * that is where the question comes up: the handle collecting for one cup is
 * rarely the handle collecting for the next, and somebody who has just made a
 * cup is about to be asked where its money goes.
 *
 * A cup that names nothing shows the platform default instead, and says which —
 * an empty list here would read as "nobody can pay", when in fact the captain
 * is shown the usual account.
 */
function Money({
  cup,
  channels,
  may,
  busy,
  run,
}: {
  cup: TournamentDetail;
  channels: PaymentChannel[];
  may: boolean;
  busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; reason?: string }>, said: string) => Promise<void>;
}) {
  const mine = channels.filter((c) => c.tournamentId === cup.tournamentId);
  const fallback = channels.filter((c) => c.tournamentId === null && c.active);

  const [editing, setEditing] = useState<string | null>(null);
  const [kind, setKind] = useState<PaymentChannelKind>('instapay');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [instructions, setInstructions] = useState('');

  const start = (c: PaymentChannel) => {
    setEditing(c.id);
    setKind(c.kind);
    setLabel(c.label);
    setValue(c.value);
    setInstructions(c.instructions ?? '');
  };

  const clear = () => {
    setEditing(null);
    setKind('instapay');
    setLabel('');
    setValue('');
    setInstructions('');
  };

  const hint = KINDS.find((k) => k.value === kind)?.hint ?? 'Number';

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Where the money goes</h2>
        <span className="spacer" />
        <span className="faint">
          {cup.entryFeeEgp > 0
            ? `Captains are asked for ${cup.entryFeeEgp} EGP`
            : 'This cup is free to enter'}
        </span>
      </div>

      {mine.length === 0 ? (
        <div className="empty">
          {fallback.length
            ? `This cup names no account of its own, so captains are shown the platform default (${fallback[0].label} · ${fallback[0].value}).`
            : 'Nothing is set. A captain reaching checkout is told this cup has not said where to send the money.'}
        </div>
      ) : (
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Kind</th>
                <th>Label</th>
                <th>Number or account</th>
                <th>Note to the captain</th>
                {may ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {mine.map((c) => (
                <tr key={c.id}>
                  <td>{KINDS.find((k) => k.value === c.kind)?.label ?? c.kind}</td>
                  <td style={{ fontWeight: 600 }}>{c.label}</td>
                  <td style={{ fontFamily: 'ui-monospace, monospace' }}>{c.value}</td>
                  <td className="faint">{c.instructions ?? ''}</td>
                  {may ? (
                    <td className="num">
                      <span className="row" style={{ justifyContent: 'flex-end' }}>
                        <button className="small" disabled={busy} onClick={() => start(c)}>
                          Change
                        </button>
                        <button
                          className="small danger"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const res = await deletePaymentChannel(c.id);
                              if (res.ok && editing === c.id) clear();
                              return res;
                            }, `${c.label} removed.`)
                          }
                        >
                          Remove
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

      {may ? (
        <div className="row" style={{ marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
          <select value={kind} onChange={(e) => setKind(e.target.value as PaymentChannelKind)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Whose account — X League, Vodafone Cash"
            style={{ minWidth: 240 }}
          />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={hint}
            style={{ minWidth: 220 }}
          />
          <input
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Anything the captain needs to know (optional)"
            style={{ minWidth: 260 }}
          />
          <button
            className="primary"
            disabled={busy || label.trim().length < 2 || value.trim().length < 2}
            onClick={() =>
              void run(async () => {
                const res = await savePaymentChannel({
                  id: editing,
                  tournamentId: cup.tournamentId,
                  kind,
                  label: label.trim(),
                  value: value.trim(),
                  instructions: instructions.trim() || null,
                });
                if (res.ok) clear();
                return res;
              }, editing ? 'Changed. Captains see the new details now.' : 'Added.')
            }
          >
            {editing ? 'Save the change' : 'Add an account'}
          </button>
          {editing ? (
            <button disabled={busy} onClick={clear}>
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
