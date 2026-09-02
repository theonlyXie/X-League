import { supabase } from '@/lib/supabase';

/**
 * What a referee does.
 *
 * Cups only — a Thursday kickabout has no referee, and this module has no way
 * to reach one. Everything here refuses for anybody the console has not made a
 * referee, so the screens are a convenience rather than the gate.
 */

export type RefFixture = {
  fixtureId: string;
  tournamentId: string;
  tournamentName: string;
  round: number;
  homeName: string;
  awayName: string;
  venueName: string | null;
  pitchLabel: string | null;
  kicksOffAt: string | null;
  state: 'scheduled' | 'played' | 'walkover' | 'cancelled';
  scoreHome: number | null;
  scoreAway: number | null;
  recorded: boolean;
};

export async function refereeFixtures(limit = 60): Promise<RefFixture[]> {
  const { data, error } = await supabase().rpc('referee_fixtures', { p_limit: limit });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    fixtureId: r.fixture_id,
    tournamentId: r.tournament_id,
    tournamentName: r.tournament_name,
    round: r.round,
    homeName: r.home_name,
    awayName: r.away_name,
    venueName: r.venue_name,
    pitchLabel: r.pitch_label,
    kicksOffAt: r.kicks_off_at,
    state: r.state,
    scoreHome: r.score_home,
    scoreAway: r.score_away,
    recorded: r.recorded,
  }));
}

export type SheetLine = {
  playerId: string;
  displayName: string;
  side: 'home' | 'away';
  goals: number;
  assists: number;
  fouls: number;
  yellows: number;
  reds: number;
};

export async function refereeSheet(fixtureId: string): Promise<SheetLine[]> {
  const { data, error } = await supabase().rpc('referee_sheet', { p_fixture_id: fixtureId });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    playerId: r.player_id,
    displayName: r.display_name,
    side: r.side,
    goals: r.goals,
    assists: r.assists,
    fouls: r.fouls,
    yellows: r.yellows,
    reds: r.reds,
  }));
}

/**
 * The score and the sheet go together, because they are one act. A score saved
 * on its own and a sheet abandoned halfway is how a cup ends up with a table
 * nobody can explain.
 */
export async function refereeRecord(
  fixtureId: string,
  scoreHome: number,
  scoreAway: number,
  lines: SheetLine[],
): Promise<{ ok: boolean; matchId?: string; reason?: string }> {
  const { data, error } = await supabase().rpc('referee_record', {
    p_fixture_id: fixtureId,
    p_score_home: scoreHome,
    p_score_away: scoreAway,
    p_lines: lines.map((l) => ({
      player_id: l.playerId,
      goals: l.goals,
      assists: l.assists,
      fouls: l.fouls,
      yellows: l.yellows,
      reds: l.reds,
    })),
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return { ok: !!row?.ok, matchId: row?.match_id ?? undefined, reason: row?.reason ?? undefined };
}
