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
  /** Where it is. Null until somebody places it — a real state, not a gap. */
  venue_name: string | null;
  pitch_label: string | null;
  /**
   * True when a booking sits behind this fixture. It decides which of the two
   * result routes is the right one, so the console offers one button rather
   * than two where one is always refused.
   */
  booked: boolean;
  /** The match behind it, once a result has been recorded. */
  match_id: string | null;
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

/** A ground this cup is played on. The host is the one that says who runs it. */
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
  /** What the winner takes. Zero until somebody names it. */
  prizePoolEgp: number;
  maxTeams: number;
  description: string | null;
  teams: Entrant[];
  fixtures: Fixture[];
  standings: StandingRow[];
  venues: CupVenue[];
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
    prizePoolEgp: Number(r.prize_pool_egp ?? 0),
    maxTeams: r.max_teams as number,
    description: (r.description as string) ?? null,
    teams: (r.teams as Entrant[]) ?? [],
    fixtures: (r.fixtures as Fixture[]) ?? [],
    standings: (r.standings as StandingRow[]) ?? [],
    venues: (r.venues as CupVenue[]) ?? [],
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

/**
 * Every pitch the cup may use, across every ground it is played on.
 *
 * The placer groups by `venueName` rather than asking for a venue and then its
 * pitches: a cup in Giza across four grounds is one list an organiser reads
 * down, not four screens they have to hold in their head.
 */
export type CupPitch = {
  pitchId: string;
  label: string;
  venueId: string;
  venueName: string;
  area: string | null;
  isHost: boolean;
};

export async function tournamentPitches(id: string): Promise<CupPitch[]> {
  const { data, error } = await supabase().rpc('tournament_pitches', { p_tournament_id: id });
  if (error) throw error;
  return (data as Array<Record<string, unknown>>).map((r) => ({
    pitchId: r.pitch_id as string,
    label: r.label as string,
    venueId: r.venue_id as string,
    venueName: r.venue_name as string,
    area: (r.area as string) ?? null,
    isHost: r.is_host as boolean,
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

/**
 * The team sheet behind a played fixture: who was on it, and what they are
 * currently credited with.
 *
 * `goals` and `assists` had no writer at all until now, which meant the scorers'
 * board could never show anybody and two of a cup's five awards could never be
 * given. This is the read half of the fix.
 */
export type SheetLine = {
  playerId: string;
  displayName: string;
  side: 'home' | 'away';
  position: string | null;
  goals: number;
  assists: number;
};

export type MatchSheet = {
  lines: SheetLine[];
  scoreHome: number | null;
  scoreAway: number | null;
};

export async function matchSheet(matchId: string): Promise<MatchSheet> {
  const { data, error } = await supabase().rpc('match_sheet', { p_match_id: matchId });
  if (error) throw error;
  const rows = data as Array<Record<string, unknown>>;
  return {
    lines: rows.map((r) => ({
      playerId: r.player_id as string,
      displayName: r.display_name as string,
      side: r.side as 'home' | 'away',
      position: (r.position_code as string) ?? null,
      goals: (r.goals as number) ?? 0,
      assists: (r.assists as number) ?? 0,
    })),
    scoreHome: (rows[0]?.score_home as number) ?? null,
    scoreAway: (rows[0]?.score_away as number) ?? null,
  };
}

/**
 * Write the sheet. It replaces what is there rather than adding to it, so a
 * correction is the corrected sheet.
 */
export const setMatchScorers = (
  matchId: string,
  lines: { playerId: string; goals: number; assists: number }[],
) =>
  act('set_match_scorers', {
    p_match_id: matchId,
    p_lines: lines.map((l) => ({
      player_id: l.playerId,
      goals: l.goals,
      assists: l.assists,
    })),
  });

/**
 * Draw the round after the one just finished.
 *
 * A knockout's later rounds cannot be drawn in advance — who is in round two is
 * decided by round one — so this is a button the organiser presses once the
 * round is complete, not something that fires on the last result.
 */
export async function advanceKnockout(
  id: string,
): Promise<{ ok: true; created: number } | { ok: false; reason: string }> {
  const { data, error } = await supabase().rpc('advance_knockout', { p_tournament_id: id });
  if (error) return { ok: false, reason: error.message };
  const res = outcome<{ created: number }>(data);
  return res.ok ? { ok: true, created: res.row.created } : { ok: false, reason: res.reason };
}

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

export const addTournamentVenue = (tournamentId: string, venueId: string) =>
  act('add_tournament_venue', { p_tournament_id: tournamentId, p_venue_id: venueId });

export const removeTournamentVenue = (tournamentId: string, venueId: string) =>
  act('remove_tournament_venue', { p_tournament_id: tournamentId, p_venue_id: venueId });

/**
 * Put a match at a pitch and an hour without a booking behind it.
 *
 * `kicksOffAt` is an ISO instant. The picker builds it from a local date and
 * time in Cairo, which is the clock the organiser and everybody playing is on.
 */
export const placeFixture = (fixtureId: string, pitchId: string, kicksOffAt: string) =>
  act('place_fixture', {
    p_fixture_id: fixtureId,
    p_pitch_id: pitchId,
    p_kicks_off_at: kicksOffAt,
  });

export const recordFixtureResult = (fixtureId: string) =>
  act('record_fixture_result', { p_fixture_id: fixtureId });

/**
 * Write down the score for a fixture with no booking behind it.
 *
 * The team sheets come from the squads that entered, so the people who played
 * can rate each other — which is what turns the fixture into evidence.
 */
export const reportFixtureResult = (fixtureId: string, home: number, away: number) =>
  act('report_fixture_result', {
    p_fixture_id: fixtureId,
    p_score_home: home,
    p_score_away: away,
  });

// ---------------------------------------------------------------------------
// Entry money, and closing a cup
// ---------------------------------------------------------------------------

/**
 * Where a cup's entry money goes.
 *
 * `tournamentId` null is the platform default, shown for any cup that has named
 * none of its own — so the usual accounts are entered once and a particular cup
 * can still collect somewhere else without every other cup repeating itself.
 */
export type PaymentChannelKind = 'instapay' | 'bank' | 'wallet' | 'contact';

export type PaymentChannel = {
  id: string;
  tournamentId: string | null;
  tournamentName: string | null;
  kind: PaymentChannelKind;
  label: string;
  value: string;
  instructions: string | null;
  active: boolean;
  sort: number;
};

export async function paymentChannels(): Promise<PaymentChannel[]> {
  const { data, error } = await supabase().rpc('admin_payment_channels');
  if (error) throw error;
  return (data as any[]).map((r) => ({
    id: r.id,
    tournamentId: r.tournament_id,
    tournamentName: r.tournament_name,
    kind: r.kind,
    label: r.label,
    value: r.value,
    instructions: r.instructions,
    active: r.active,
    sort: r.sort,
  }));
}

export async function savePaymentChannel(input: {
  id?: string | null;
  tournamentId?: string | null;
  kind: PaymentChannelKind;
  label: string;
  value: string;
  instructions?: string | null;
  active?: boolean;
  sort?: number;
}): Promise<Result> {
  return act('admin_set_payment_channel', {
    p_id: input.id ?? null,
    p_tournament_id: input.tournamentId ?? null,
    p_kind: input.kind,
    p_label: input.label,
    p_value: input.value,
    p_instructions: input.instructions ?? null,
    p_active: input.active ?? true,
    p_sort: input.sort ?? 0,
  });
}

export type PromoKind = 'amount' | 'percent' | 'free';

export type PromoCode = {
  id: string;
  code: string;
  kind: PromoKind;
  amountEgp: number | null;
  percent: number | null;
  tournamentId: string | null;
  tournamentName: string | null;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  active: boolean;
  note: string | null;
  createdAt: string;
};

export async function promoCodes(): Promise<PromoCode[]> {
  const { data, error } = await supabase().rpc('admin_promo_codes', { p_limit: 200 });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    id: r.id,
    code: r.code,
    kind: r.kind,
    amountEgp: r.amount_egp,
    percent: r.percent,
    tournamentId: r.tournament_id,
    tournamentName: r.tournament_name,
    maxUses: r.max_uses,
    usedCount: r.used_count,
    expiresAt: r.expires_at,
    active: r.active,
    note: r.note,
    createdAt: r.created_at,
  }));
}

export async function createPromoCode(input: {
  kind: PromoKind;
  amountEgp?: number | null;
  percent?: number | null;
  tournamentId?: string | null;
  maxUses?: number;
  expiresAt?: string | null;
  note?: string | null;
  code?: string | null;
}): Promise<{ ok: true; code: string } | { ok: false; reason: string }> {
  const { data, error } = await supabase().rpc('admin_create_promo_code', {
    p_kind: input.kind,
    p_amount_egp: input.amountEgp ?? null,
    p_percent: input.percent ?? null,
    p_tournament_id: input.tournamentId ?? null,
    p_max_uses: input.maxUses ?? 1,
    p_expires_at: input.expiresAt ?? null,
    p_note: input.note ?? null,
    p_code: input.code ?? null,
  });
  if (error) return { ok: false, reason: error.message };
  const res = outcome<{ code: string }>(data);
  return res.ok ? { ok: true, code: res.row.code } : { ok: false, reason: res.reason };
}

export const deletePaymentChannel = (id: string) =>
  act('admin_delete_payment_channel', { p_id: id });

export const setPromoActive = (id: string, active: boolean) =>
  act('admin_set_promo_active', { p_id: id, p_active: active });

/** Every entry in a cup, with what it owes and what its captain claims to have sent. */
export type Entry = {
  registrationId: string;
  entrantName: string;
  clubId: string | null;
  teamId: string | null;
  crestUrl: string | null;
  state: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  feeEgp: number;
  promoOffEgp: number;
  pointsOffEgp: number;
  amountDueEgp: number;
  paid: boolean;
  paidAt: string | null;
  paymentNote: string | null;
  paymentClaimedAt: string | null;
  createdAt: string;
};

export async function tournamentEntries(id: string): Promise<Entry[]> {
  const { data, error } = await supabase().rpc('tournament_entries', { p_tournament_id: id });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    registrationId: r.registration_id,
    entrantName: r.entrant_name,
    clubId: r.club_id,
    teamId: r.team_id,
    crestUrl: r.crest_url,
    state: r.state,
    feeEgp: r.fee_egp,
    promoOffEgp: r.promo_off_egp,
    pointsOffEgp: r.points_off_egp,
    amountDueEgp: r.amount_due_egp,
    paid: r.paid,
    paidAt: r.paid_at,
    paymentNote: r.payment_note,
    paymentClaimedAt: r.payment_claimed_at,
    createdAt: r.created_at,
  }));
}

export const setRegistrationPaid = (registrationId: string, paid: boolean) =>
  act('set_registration_paid', { p_registration_id: registrationId, p_paid: paid });

export const setRegion = (id: string, region: string | null) =>
  act('set_tournament_region', { p_tournament_id: id, p_region: region });

/** Close a cup and write down what it produced. */
export async function settleTournament(
  id: string,
): Promise<{ ok: true; awards: number } | { ok: false; reason: string }> {
  const { data, error } = await supabase().rpc('settle_tournament', { p_tournament_id: id });
  if (error) return { ok: false, reason: error.message };
  const res = outcome<{ awards: number }>(data);
  return res.ok ? { ok: true, awards: res.row.awards } : { ok: false, reason: res.reason };
}

export type AwardKind = 'champion' | 'runner_up' | 'top_scorer' | 'best_player' | 'best_goalkeeper';

export type Award = {
  kind: AwardKind;
  displayName: string;
  clubId: string | null;
  playerId: string | null;
  value: number | null;
  note: string | null;
};

export async function tournamentAwards(id: string): Promise<Award[]> {
  const { data, error } = await supabase().rpc('tournament_awards', { p_tournament_id: id });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    kind: r.kind,
    displayName: r.display_name,
    clubId: r.club_id,
    playerId: r.player_id,
    value: r.value,
    note: r.note,
  }));
}

/**
 * Name what the winner of this cup takes.
 *
 * Recorded for one reason: a captain assembling a side promises players a
 * percentage of it on their club invitation, and a percentage of a number
 * nobody has named cannot be weighed by the person being asked. X League does
 * not hold or pay this money — it records what the cup is worth so the promise
 * can be shown as a figure.
 */
export async function setPrizePool(
  tournamentId: string,
  prizePoolEgp: number,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('set_tournament_prize_pool', {
    p_tournament_id: tournamentId,
    p_prize_pool_egp: prizePoolEgp,
  });
  if (error) throw error;
  const row = (data as Array<Record<string, unknown>>)[0];
  return { ok: Boolean(row?.ok), reason: (row?.reason as string) ?? undefined };
}
