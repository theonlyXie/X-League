'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Gate, canAct } from '@/components/Gate';
import { Notice, Shell, StateChip, dayText } from '@/components/Shell';
import { useSession } from '@/lib/session';
import {
  adminVenues,
  addTournamentVenue,
  createTournament,
  listForOrganiser,
  type TournamentFormat,
  type TournamentSummary,
  type Venue,
} from '@/lib/cups';

export default function CupsPage() {
  return (
    <Gate>
      <Shell>
        <Cups />
      </Shell>
    </Gate>
  );
}

function Cups() {
  const { role } = useSession();
  const [cups, setCups] = useState<TournamentSummary[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, v] = await Promise.all([listForOrganiser(), adminVenues()]);
      setCups(t);
      setVenues(v);
      setError(null);
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="row" style={{ marginBottom: 20 }}>
        <div>
          <h1>Cups</h1>
          <p className="faint" style={{ margin: 0 }}>
            Create a competition, take entries, draw it, and record what was played.
          </p>
        </div>
        <span className="spacer" />
        {canAct(role) ? (
          // Not offered until there is somewhere to hold a cup. Opening the
          // form onto an empty venue picker looks broken and reads as a bug.
          <button
            className="primary"
            disabled={loading || venues.length === 0}
            title={venues.length === 0 && !loading ? 'No venues to hold a cup at yet' : undefined}
            onClick={() => setCreating((c) => !c)}
          >
            {creating ? 'Cancel' : loading ? 'Loading…' : 'New cup'}
          </button>
        ) : null}
      </div>

      <Notice text={error} />

      {!loading && venues.length === 0 && canAct(role) ? (
        <div className="notice error">
          No venues yet, so there is nowhere to hold a cup. A venue appears here as
          soon as somebody registers one from the app.
        </div>
      ) : null}

      {creating ? (
        <CreateCup
          venues={venues}
          onDone={() => {
            setCreating(false);
            void load();
          }}
        />
      ) : null}

      <div className="panel">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : cups.length === 0 ? (
          <div className="empty">
            No cups yet.
            {canAct(role) ? ' Create one to take entries.' : ''}
          </div>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Cup</th>
                  <th>Venue</th>
                  <th>Format</th>
                  <th>Starts</th>
                  <th className="num">Entered</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {cups.map((c) => (
                  <tr key={c.tournamentId}>
                    <td>
                      <Link href={`/cups/${c.tournamentId}`} style={{ fontWeight: 600 }}>
                        {c.name}
                      </Link>
                    </td>
                    <td className="muted">
                      {c.venueName}
                      {c.area ? ` · ${c.area}` : ''}
                    </td>
                    <td className="muted">{c.format.replace('_', ' + ')}</td>
                    <td className="muted">{dayText(c.startsOn)}</td>
                    <td className="num">
                      {c.entered} / {c.maxTeams}
                    </td>
                    <td>
                      <StateChip state={c.state} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* This is the organiser's list, so drafts are here. Players see only
          what has been opened, which is worth saying out loud — otherwise a
          draft looks live to the person who made it. */}
      <p className="faint">
        Drafts are visible here but not to players. Open a cup from its own page when it is ready
        to take entries.
      </p>
    </>
  );
}

function CreateCup({ venues, onDone }: { venues: Venue[]; onDone: () => void }) {
  const router = useRouter();
  const [venueId, setVenueId] = useState(venues[0]?.venueId ?? '');
  /**
   * The other grounds this cup is played on.
   *
   * A cup is not a place, it is a competition — a Giza cup runs across whichever
   * grounds the organiser could get, and each match may be at a different one.
   * The host above still decides who may run the cup, which is why it is a
   * separate choice rather than the first tick in this list.
   */
  const [alsoAt, setAlsoAt] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [format, setFormat] = useState<TournamentFormat>('league');
  const [maxTeams, setMaxTeams] = useState(8);
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [entryFee, setEntryFee] = useState(0);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The venue list arrives after the first render, so the default follows it.
  useEffect(() => {
    if (!venueId && venues.length) setVenueId(venues[0].venueId);
  }, [venues, venueId]);

  const submit = async () => {
    setBusy(true);
    const res = await createTournament({
      venueId,
      name: name.trim(),
      format,
      maxTeams,
      startsOn: startsOn || null,
      endsOn: endsOn || null,
      entryFeeEgp: entryFee,
      description: description.trim() || null,
    });
    if (!res.ok) {
      setBusy(false);
      setError(res.reason);
      return;
    }

    // The extra grounds, added one at a time because that is the operation the
    // server exposes and each one can be refused for its own reason. A ground
    // that will not attach is reported rather than swallowed — the cup exists
    // either way, and an organiser who thinks they picked four venues should
    // not discover on the fixture screen that they got three.
    const refused: string[] = [];
    for (const id of alsoAt) {
      const added = await addTournamentVenue(res.tournamentId, id);
      if (!added.ok) {
        refused.push(`${venues.find((v) => v.venueId === id)?.name ?? 'A ground'}: ${added.reason}`);
      }
    }
    setBusy(false);

    if (refused.length) {
      setError(`The cup was created. These grounds were not added — ${refused.join('; ')}`);
      return;
    }
    onDone();
    router.push(`/cups/${res.tournamentId}`);
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>New cup</h2>
      </div>

      <Notice text={error} />

      <div className="grid cols-2">
        <div>
          <label htmlFor="venue">Venue</label>
          <select
            id="venue"
            value={venueId}
            onChange={(e) => {
              setVenueId(e.target.value);
              // The host is never also an extra: it is already a ground.
              setAlsoAt((cur) => cur.filter((id) => id !== e.target.value));
            }}
          >
            {venues.map((v) => (
              <option key={v.venueId} value={v.venueId}>
                {v.name}
                {v.area ? ` — ${v.area}` : ''} ({v.pitches} pitches)
              </option>
            ))}
          </select>
          <p className="faint" style={{ marginTop: 6, marginBottom: 0 }}>
            The home ground. It decides who may run this cup.
          </p>
        </div>
        {/* Every other ground the cup may be played on. Ticking none is the
            ordinary single-venue cup and nothing here gets in its way. */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label>Also played at</label>
          {venues.filter((v) => v.venueId !== venueId).length === 0 ? (
            <p className="faint" style={{ margin: 0 }}>
              There is no other venue to add. A cup can always take more grounds later.
            </p>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  maxHeight: 132,
                  overflowY: 'auto',
                }}
              >
                {venues
                  .filter((v) => v.venueId !== venueId)
                  .map((v) => {
                    const on = alsoAt.includes(v.venueId);
                    return (
                      <label
                        key={v.venueId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '7px 11px',
                          borderRadius: 999,
                          cursor: 'pointer',
                          border: `1px solid var(${on ? '--gold' : '--hairline'})`,
                          background: on ? 'var(--gold-fill)' : 'transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setAlsoAt((cur) =>
                              on ? cur.filter((id) => id !== v.venueId) : [...cur, v.venueId],
                            )
                          }
                          style={{ width: 'auto', margin: 0 }}
                        />
                        <span style={{ fontSize: 13 }}>
                          {v.name}
                          {v.area ? ` — ${v.area}` : ''}
                        </span>
                      </label>
                    );
                  })}
              </div>
              <p className="faint" style={{ marginTop: 6, marginBottom: 0 }}>
                {alsoAt.length === 0
                  ? 'One ground unless you tick more. A match can then be placed at any of them.'
                  : `${alsoAt.length + 1} grounds. Each match can be placed at any of them.`}
              </p>
            </>
          )}
        </div>

        <div>
          <label htmlFor="name">Name</label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nasr City Cup"
          />
        </div>
        <div>
          <label htmlFor="format">Format</label>
          <select
            id="format"
            value={format}
            onChange={(e) => setFormat(e.target.value as TournamentFormat)}
          >
            <option value="league">League — everyone plays everyone</option>
            <option value="knockout">Knockout</option>
            <option value="group_knockout">Groups, then knockout</option>
          </select>
        </div>
        <div>
          <label htmlFor="max">Teams</label>
          <input
            id="max"
            type="number"
            min={2}
            max={64}
            value={maxTeams}
            onChange={(e) => setMaxTeams(Number(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor="from">First day</label>
          <input id="from" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </div>
        <div>
          <label htmlFor="to">Last day</label>
          <input id="to" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </div>
        <div>
          <label htmlFor="fee">Entry fee (EGP)</label>
          <input
            id="fee"
            type="number"
            min={0}
            value={entryFee}
            onChange={(e) => setEntryFee(Number(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor="desc">Description</label>
          <input
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Thursdays, 8pm kick-off"
          />
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button
          className="primary"
          disabled={busy || name.trim().length < 2 || !venueId}
          onClick={() => void submit()}
        >
          {busy ? 'Creating…' : 'Create as draft'}
        </button>
        <span className="faint">
          It starts as a draft. Nobody can enter until you open it.
        </span>
      </div>
    </div>
  );
}
