import { supabase } from '@/lib/supabase';

/**
 * Tournaments (P-15 – P-20).
 *
 * `tournamentDetail` returns the entrants, the fixture list and the current
 * standings together, because all three are one page and fetching them
 * separately would let a player see a table that disagrees with the results
 * above it.
 */

export type TournamentState = 'draft' | 'open' | 'full' | 'running' | 'complete' | 'cancelled';
export type TournamentFormat = 'league' | 'knockout' | 'group_knockout';

export type TournamentSummary = {
  tournamentId: string;
  name: string;
  venueName: string;
  area: string | null;
  format: TournamentFormat;
  state: TournamentState;
  startsOn: string | null;
  endsOn: string | null;
  entryFeeEgp: number;
  maxTeams: number;
  entered: number;
};

export async function listTournaments(limit = 25): Promise<TournamentSummary[]> {
  const { data, error } = await supabase().rpc('list_tournaments', { p_limit: limit });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    tournamentId: r.tournament_id,
    name: r.name,
    venueName: r.venue_name,
    area: r.area,
    format: r.format,
    state: r.state,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    entryFeeEgp: r.entry_fee_egp,
    maxTeams: r.max_teams,
    entered: r.entered,
  }));
}

/**
 * An entry in a cup. A club or a team is behind it, and which one is behind it
 * is the entry's business rather than the table's — the name and the crest come
 * off the entry, so a club renamed mid-season does not rewrite January's table.
 */
export type Entrant = {
  registration_id: string;
  entrant_name: string;
  club_id: string | null;
  team_id: string | null;
  crest_url: string | null;
  state: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  paid: boolean;
};

export type Fixture = {
  fixture_id: string;
  round: number;
  sequence: number;
  home: string | null;
  away: string | null;
  home_entrant_id: string | null;
  away_entrant_id: string | null;
  score_home: number | null;
  score_away: number | null;
  state: 'scheduled' | 'played' | 'walkover' | 'cancelled';
  kicks_off_at: string | null;
};

export type StandingRow = {
  entrant_id: string;
  entrant_name: string;
  club_id: string | null;
  team_id: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
};

export type TournamentDetail = {
  tournamentId: string;
  name: string;
  venueName: string;
  area: string | null;
  format: TournamentFormat;
  state: TournamentState;
  startsOn: string | null;
  endsOn: string | null;
  entryFeeEgp: number;
  maxTeams: number;
  description: string | null;
  teams: Entrant[];
  fixtures: Fixture[];
  standings: StandingRow[];
};

export async function tournamentDetail(tournamentId: string): Promise<TournamentDetail | null> {
  const { data, error } = await supabase().rpc('tournament_detail', {
    p_tournament_id: tournamentId,
  });
  if (error) throw error;
  const rows = data as any[];
  if (!rows.length) return null;
  const r = rows[0];
  return {
    tournamentId: r.tournament_id,
    name: r.name,
    venueName: r.venue_name,
    area: r.area,
    format: r.format,
    state: r.state,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    entryFeeEgp: r.entry_fee_egp,
    maxTeams: r.max_teams,
    description: r.description,
    teams: r.teams ?? [],
    fixtures: r.fixtures ?? [],
    standings: r.standings ?? [],
  };
}

export type MyTournament = {
  tournamentId: string;
  name: string;
  venueName: string;
  teamName: string;
  state: TournamentState;
  registrationState: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  startsOn: string | null;
};

export async function myTournaments(): Promise<MyTournament[]> {
  const { data, error } = await supabase().rpc('my_tournaments');
  if (error) throw error;
  return (data as any[]).map((r) => ({
    tournamentId: r.tournament_id,
    name: r.name,
    venueName: r.venue_name,
    teamName: r.team_name,
    state: r.state,
    registrationState: r.registration_state,
    startsOn: r.starts_on,
  }));
}

/** TRN-003: a team enters, and only its captain may enter it. */
export async function registerTeam(
  tournamentId: string,
  teamId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('register_team', {
    p_tournament_id: tournamentId,
    p_team_id: teamId,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

// ---------------------------------------------------------------------------
// Running one (venue managers)
// ---------------------------------------------------------------------------

export async function createTournament(
  venueId: string,
  name: string,
  opts: {
    format?: TournamentFormat;
    maxTeams?: number;
    startsOn?: string;
    endsOn?: string;
    entryFeeEgp?: number;
    description?: string;
  } = {},
): Promise<{ ok: boolean; tournamentId?: string; reason?: string }> {
  const { data, error } = await supabase().rpc('create_tournament', {
    p_venue_id: venueId,
    p_name: name,
    p_format: opts.format ?? 'league',
    p_max_teams: opts.maxTeams ?? 8,
    p_starts_on: opts.startsOn ?? null,
    p_ends_on: opts.endsOn ?? null,
    p_entry_fee_egp: opts.entryFeeEgp ?? 0,
    p_description: opts.description ?? null,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok
    ? { ok: true, tournamentId: row.tournament_id }
    : { ok: false, reason: row.reason ?? undefined };
}

export async function setTournamentState(
  tournamentId: string,
  state: TournamentState,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('set_tournament_state', {
    p_tournament_id: tournamentId,
    p_state: state,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

export async function decideRegistration(
  registrationId: string,
  accept: boolean,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('decide_registration', {
    p_registration_id: registrationId,
    p_accept: accept,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

export async function generateFixtures(
  tournamentId: string,
): Promise<{ ok: boolean; created?: number; reason?: string }> {
  const { data, error } = await supabase().rpc('generate_fixtures', {
    p_tournament_id: tournamentId,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true, created: row.created } : { ok: false, reason: row.reason ?? undefined };
}

export async function recordFixtureResult(
  fixtureId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('record_fixture_result', {
    p_fixture_id: fixtureId,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}
