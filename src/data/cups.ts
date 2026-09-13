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
  /** Where the cup is, falling back to the host venue's area. */
  region: string | null;
  /** What the winner takes. Zero where the organiser has not named a pot. */
  prizePoolEgp: number;
};

export async function listTournaments(limit = 25, region?: string | null): Promise<TournamentSummary[]> {
  const { data, error } = await supabase().rpc('list_tournaments', {
    p_limit: limit,
    p_region: region ?? null,
  });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    tournamentId: r.tournament_id,
    name: r.name,
    venueName: r.venue_name,
    area: r.area,
    region: r.region,
    format: r.format,
    state: r.state,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    entryFeeEgp: r.entry_fee_egp,
    maxTeams: r.max_teams,
    entered: r.entered,
    prizePoolEgp: Number(r.prize_pool_egp ?? 0),
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
  /** Where it is played. Null until an organiser has placed it. */
  venue_name: string | null;
  pitch_label: string | null;
  /** True when a booking sits behind it. The organiser's business, not a player's. */
  booked: boolean;
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

/** One of the grounds a cup is played on. */
export type CupVenue = {
  venue_id: string;
  name: string;
  area: string | null;
  is_host: boolean;
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
  /** Every ground the cup is played across, the host first. */
  venues: CupVenue[];
  /**
   * What the winner takes, in EGP. Recorded so that a share promised to a
   * player on their club invitation can be shown as a figure rather than a
   * percentage of something nobody has named.
   */
  prizePoolEgp: number;
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
    venues: r.venues ?? [],
    prizePoolEgp: Number(r.prize_pool_egp ?? 0),
  };
}

/**
 * A match this player is in: who, where and when.
 *
 * The cup page can only say where a *fixture* is; this is the other question —
 * a player opening the app wants their own next match, not to remember which
 * cup it is in and find themselves in the list. `venueName` and `kicksOffAt`
 * are both nullable because a drawn match that nobody has placed yet is a real
 * state, and the screen says so rather than showing a blank.
 */
export type MyCupFixture = {
  fixtureId: string;
  tournamentId: string;
  cupName: string;
  round: number;
  mySide: 'home' | 'away';
  myEntrant: string;
  opponent: string | null;
  venueName: string | null;
  area: string | null;
  pitchLabel: string | null;
  kicksOffAt: string | null;
  state: 'scheduled' | 'played' | 'walkover' | 'cancelled';
  scoreHome: number | null;
  scoreAway: number | null;
  /** The match behind it, once a result has been recorded. */
  matchId: string | null;
  /** True while this player can still rate the people they played against. */
  canRate: boolean;
};

export async function myCupFixtures(limit = 20): Promise<MyCupFixture[]> {
  const { data, error } = await supabase().rpc('my_cup_fixtures', { p_limit: limit });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    fixtureId: r.fixture_id,
    tournamentId: r.tournament_id,
    cupName: r.cup_name,
    round: r.round,
    mySide: r.my_side,
    myEntrant: r.my_entrant,
    opponent: r.opponent,
    venueName: r.venue_name,
    area: r.area,
    pitchLabel: r.pitch_label,
    kicksOffAt: r.kicks_off_at,
    state: r.state,
    scoreHome: r.score_home,
    scoreAway: r.score_away,
    matchId: r.match_id,
    canRate: r.can_rate,
  }));
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

/**
 * Name what the winner takes.
 *
 * The organiser of the cup, or a platform admin. Separate from creating the
 * cup because the pot is usually settled after the draft exists and changed
 * again as entries come in.
 */
export async function setTournamentPrizePool(
  tournamentId: string,
  prizePoolEgp: number,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('set_tournament_prize_pool', {
    p_tournament_id: tournamentId,
    p_prize_pool_egp: prizePoolEgp,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return { ok: !!row?.ok, reason: row?.reason ?? undefined };
}
