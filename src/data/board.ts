import { supabase } from '@/lib/supabase';

/**
 * The record: who is scoring, who has won something.
 *
 * Cup goals travel alongside total goals rather than replacing them. A goal in
 * a Thursday friendly is a goal; a goal in a cup is one somebody organised a
 * competition around. Showing both lets a player see the difference instead of
 * arguing with a number that silently ignored half their season.
 */

export type BoardRow = {
  place: number;
  playerId: string;
  displayName: string;
  photoUrl: string | null;
  matches: number;
  goals: number;
  assists: number;
  cupMatches: number;
  cupGoals: number;
};

export async function leaderboard(venueId?: string | null, limit = 50): Promise<BoardRow[]> {
  const { data, error } = await supabase().rpc('leaderboard', {
    p_venue_id: venueId ?? null,
    p_since: null,
    p_limit: limit,
  });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    place: r.place,
    playerId: r.player_id,
    displayName: r.display_name,
    photoUrl: r.photo_url,
    matches: r.matches,
    goals: r.goals,
    assists: r.assists,
    cupMatches: r.cup_matches,
    cupGoals: r.cup_goals,
  }));
}

export type KeeperRow = {
  place: number;
  playerId: string;
  displayName: string;
  photoUrl: string | null;
  matches: number;
  cleanSheets: number;
  conceded: number;
};

export async function keeperLeaderboard(venueId?: string | null, limit = 25): Promise<KeeperRow[]> {
  const { data, error } = await supabase().rpc('keeper_leaderboard', {
    p_venue_id: venueId ?? null,
    p_since: null,
    p_limit: limit,
  });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    place: r.place,
    playerId: r.player_id,
    displayName: r.display_name,
    photoUrl: r.photo_url,
    matches: r.matches,
    cleanSheets: r.clean_sheets,
    conceded: r.conceded,
  }));
}

export type FeaturedClub = {
  clubId: string;
  name: string;
  crestUrl: string | null;
  homeArea: string | null;
  trophies: number;
  latestTitle: string | null;
  latestWonOn: string | null;
};

export async function featuredClubs(limit = 6): Promise<FeaturedClub[]> {
  const { data, error } = await supabase().rpc('featured_clubs', { p_limit: limit });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    clubId: r.club_id,
    name: r.name,
    crestUrl: r.crest_url,
    homeArea: r.home_area,
    trophies: r.trophies,
    latestTitle: r.latest_title,
    latestWonOn: r.latest_won_on,
  }));
}

export type AwardKind = 'champion' | 'runner_up' | 'top_scorer' | 'best_player' | 'best_goalkeeper';

export type Award = {
  kind: AwardKind;
  displayName: string;
  clubId: string | null;
  crestUrl: string | null;
  playerId: string | null;
  photoUrl: string | null;
  value: number | null;
  note: string | null;
};

export async function tournamentAwards(tournamentId: string): Promise<Award[]> {
  const { data, error } = await supabase().rpc('tournament_awards', {
    p_tournament_id: tournamentId,
  });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    kind: r.kind,
    displayName: r.display_name,
    clubId: r.club_id,
    crestUrl: r.crest_url,
    playerId: r.player_id,
    photoUrl: r.photo_url,
    value: r.value,
    note: r.note,
  }));
}

export type Region = { region: string; cups: number };

export async function tournamentRegions(): Promise<Region[]> {
  const { data, error } = await supabase().rpc('tournament_regions');
  if (error) throw error;
  return (data as any[]).map((r) => ({ region: r.region, cups: r.cups }));
}
