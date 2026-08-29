'use client';

import { outcome, supabase } from './supabase';

/**
 * The organiser's half of the tournament API.
 *
 * Every one of these RPCs existed and had no caller — the cup side of the
 * product was built, tested and unreachable. Nothing here decides who may do
 * what: `can_run_tournament` does, inside each function, and this reports
 * whatever reason comes back rather than pre-judging a call it cannot decide.
 *
 * snake_case is converted to camelCase once, here, so no component below this
 * line has to know what the database calls a column.
 */

export type TournamentState = 'draft' | 'open' | 'full' | 'running' | 'complete' | 'cancelled';
export type TournamentFormat = 'league' | 'knockout' | 'group_knockout';

export type Venue = {
  venueId: string;
  name: string;
  area: string | null;
  verification: string;
  pitches: number;
};

export async function adminVenues(): Promise<Venue[]> {
  const { data, error } = await supabase().rpc('admin_venues');
  if (error) throw error;
  return (data as Array<Record<string, unknown>>).map((r) => ({
    venueId: r.venue_id as string,
    name: r.name as string,
    area: (r.area as string) ?? null,
    verification: r.verification as string,
    pitches: r.pitches as number,
  }));
}

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

/**
 * The organiser's own list — every cup this person may run, drafts included.
 *
 * Not `list_tournaments`: that is the public list and hides drafts, which is
 * right for players and useless here. A cup created from this dashboard starts
 * as a draft, so the public list is precisely the one place it does not appear.
 */
export async function listForOrganiser(): Promise<TournamentSummary[]> {
  const { data, error } = await supabase().rpc('tournaments_i_run', { p_limit: 100 });
  if (error) throw error;
  return (data as Array<Record<string, unknown>>).map((r) => ({
    tournamentId: r.tournament_id as string,
    name: r.name as string,
    venueName: r.venue_name as string,
    area: (r.area as string) ?? null,
    format: r.format as TournamentFormat,
    state: r.state as TournamentState,
    startsOn: (r.starts_on as string) ?? null,
    endsOn: (r.ends_on as string) ?? null,
    entryFeeEgp: r.entry_fee_egp as number,
    maxTeams: r.max_teams as number,
    entered: r.entered as number,
  }));
}

export type Entrant = {
  registration_id: string;
  team_id: string;
  team_name: string;
  state: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
};

export type Fixture = {
  fixture_id: string;
  round: number;
  sequence: number;
  home: string | null;
  away: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  score_home: number | null;
  score_away: number | null;
  state: 'scheduled' | 'played' | 'walkover' | 'cancelled';
  kicks_off_at: string | null;
};

export type StandingRow = {
  team_id: string;
  team_name: string;
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

/** Entrants, fixtures and the table arrive together, so they cannot disagree. */
export async function tournamentDetail(id: string): Promise<TournamentDetail | null> {
  const { data, error } = await supabase().rpc('tournament_detail', { p_tournament_id: id });
  if (error) throw error;
  const rows = data as Array<Record<string, unknown>>;
  if (!rows?.length) return null;
  const r = rows[0];
  return {
    tournamentId: r.tournament_id as string,
    name: r.name as string,
    venueName: r.venue_name as string,
    area: (r.area as string) ?? null,
    format: r.format as TournamentFormat,
    state: r.state as TournamentState,
    startsOn: (r.starts_on as string) ?? null,
    endsOn: (r.ends_on as string) ?? null,
    entryFeeEgp: r.entry_fee_egp as number,
    maxTeams: r.max_teams as number,
    description: (r.description as string) ?? null,
    teams: (r.teams as Entrant[]) ?? [],
    fixtures: (r.fixtures as Fixture[]) ?? [],
    standings: (r.standings as StandingRow[]) ?? [],
  };
}

export type BookableHour = {
  bookingId: string;
  pitchLabel: string;
  startsAt: string;
  state: string;
  code: string | null;
  captainName: string | null;
  /** True once a captain has reported the match — the result can be pulled. */
  reported: boolean;
  /** Set when a fixture in this cup already occupies the hour. */
  fixtureId: string | null;
};

export async function tournamentBookings(id: string, date?: string): Promise<BookableHour[]> {
  const { data, error } = await supabase().rpc('tournament_bookings', {
    p_tournament_id: id,
    ...(date ? { p_date: date } : {}),
  });
  if (error) throw error;
  return (data as Array<Record<string, unknown>>).map((r) => ({
    bookingId: r.booking_id as string,
    pitchLabel: r.pitch_label as string,
    startsAt: r.starts_at as string,
    state: r.state as string,
    code: (r.code as string) ?? null,
    captainName: (r.captain_name as string) ?? null,
    reported: r.reported as boolean,
    fixtureId: (r.fixture_id as string) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Acting
// ---------------------------------------------------------------------------

type Result = { ok: true } | { ok: false; reason: string };

async function act(fn: string, args: Record<string, unknown>): Promise<Result> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) return { ok: false, reason: error.message };
  const res = outcome(data);
  return res.ok ? { ok: true } : { ok: false, reason: res.reason };
}

export async function createTournament(input: {
  venueId: string;
  name: string;
  format: TournamentFormat;
  maxTeams: number;
  startsOn: string | null;
  endsOn: string | null;
  entryFeeEgp: number;
  description: string | null;
}): Promise<{ ok: true; tournamentId: string } | { ok: false; reason: string }> {
  const { data, error } = await supabase().rpc('create_tournament', {
    p_venue_id: input.venueId,
    p_name: input.name,
    p_format: input.format,
    p_max_teams: input.maxTeams,
    p_starts_on: input.startsOn,
    p_ends_on: input.endsOn,
    p_entry_fee_egp: input.entryFeeEgp,
    p_description: input.description,
  });
  if (error) return { ok: false, reason: error.message };
  const res = outcome<{ tournament_id: string }>(data);
  return res.ok
    ? { ok: true, tournamentId: res.row.tournament_id }
    : { ok: false, reason: res.reason };
}

export const setState = (id: string, state: TournamentState) =>
  act('set_tournament_state', { p_tournament_id: id, p_state: state });

export const decideRegistration = (registrationId: string, accept: boolean) =>
  act('decide_registration', { p_registration_id: registrationId, p_accept: accept });

export async function generateFixtures(
  id: string,
): Promise<{ ok: true; created: number } | { ok: false; reason: string }> {
  const { data, error } = await supabase().rpc('generate_fixtures', { p_tournament_id: id });
  if (error) return { ok: false, reason: error.message };
  const res = outcome<{ created: number }>(data);
  return res.ok ? { ok: true, created: res.row.created } : { ok: false, reason: res.reason };
}

export const scheduleFixture = (fixtureId: string, bookingId: string) =>
  act('schedule_fixture', { p_fixture_id: fixtureId, p_booking_id: bookingId });

export const recordFixtureResult = (fixtureId: string) =>
  act('record_fixture_result', { p_fixture_id: fixtureId });
