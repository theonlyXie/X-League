'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Gate, canAct } from '@/components/Gate';
import { Notice, Shell, StateChip, dayText } from '@/components/Shell';
import { useSession } from '@/lib/session';
import {
  adminVenues,
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
          <button className="primary" onClick={() => setCreating((c) => !c)}>
            {creating ? 'Cancel' : 'New cup'}
          </button>
        ) : null}
      </div>

      <Notice text={error} />

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

      {/* `list_tournaments` hides drafts from players by design, and this list
          is that same function — so a cup you have created but not opened will
          not appear here until it is opened. Said plainly rather than left to
          be discovered. */}
      <p className="faint">
        Drafts are not listed publicly until you open them for entries. Open a cup from its own page
        after creating it.
      </p>
    </>
  );
}

function CreateCup({ venues, onDone }: { venues: Venue[]; onDone: () => void }) {
  const router = useRouter();
  const [venueId, setVenueId] = useState(venues[0]?.venueId ?? '');
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
    setBusy(false);
    if (!res.ok) {
      setError(res.reason);
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
          <select id="venue" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            {venues.map((v) => (
              <option key={v.venueId} value={v.venueId}>
                {v.name}
                {v.area ? ` — ${v.area}` : ''} ({v.pitches} pitches)
              </option>
            ))}
          </select>
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
