import { supabase } from '@/lib/supabase';

/**
 * The evidence half of the player card: matches, peer ratings and XP.
 *
 * The card itself still comes from `myCard()` in api.ts — this is what stands
 * behind it. PRO-007 asks the card to expose its evidence rather than imply it,
 * which means these numbers are shown, not just used.
 */

export type CardEvidence = {
  verifiedMatches: number;
  playedMatches: number;
  /** How many distinct people have rated this player. */
  raterCount: number;
  ratingsGiven: number;
  xp: number;
  level: number;
  intoLevel: number;
  toNext: number;
  /** Last five results, most recent first. `-` where no score was reported. */
  form: ('W' | 'D' | 'L' | '-')[];
};

export async function myCardEvidence(): Promise<CardEvidence | null> {
  const { data, error } = await supabase().rpc('my_card_evidence');
  if (error) throw error;
  const rows = data as any[];
  if (!rows.length) return null;
  const r = rows[0];
  return {
    verifiedMatches: r.verified_matches,
    playedMatches: r.played_matches,
    raterCount: r.rater_count,
    ratingsGiven: r.ratings_given,
    xp: r.xp,
    level: r.level,
    intoLevel: r.into_level,
    toNext: r.to_next,
    form: r.form ?? [],
  };
}

export type MatchEvidence = {
  matchId: string;
  playedAt: string;
  venueName: string;
  state: 'played' | 'verified' | 'disputed' | 'void';
  scoreHome: number | null;
  scoreAway: number | null;
  side: 'home' | 'away';
  /** How many people have rated in this match at all. */
  raters: number;
  /** How many of them are this player's own ratings. */
  iRated: number;
  /** False once the seven-day window has closed (PRO-010). */
  canRate: boolean;
};

export async function myMatchEvidence(limit = 20): Promise<MatchEvidence[]> {
  const { data, error } = await supabase().rpc('my_match_evidence', { p_limit: limit });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    matchId: r.match_id,
    playedAt: r.played_at,
    venueName: r.venue_name,
    state: r.state,
    scoreHome: r.score_home,
    scoreAway: r.score_away,
    side: r.side,
    raters: r.raters,
    iRated: r.i_rated,
    canRate: r.can_rate,
  }));
}

export type PointEntry = {
  at: string;
  kind:
    | 'match_played'
    | 'match_won'
    | 'match_drawn'
    | 'rating_given'
    | 'match_verified'
    | 'no_show'
    | 'adjustment';
  points: number;
  venueName: string | null;
};

/** PTS-002: the total, explainable line by line. */
export async function myPoints(limit = 50): Promise<PointEntry[]> {
  const { data, error } = await supabase().rpc('my_points', { p_limit: limit });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    at: r.at,
    kind: r.kind,
    points: r.points,
    venueName: r.venue_name,
  }));
}

export type RateTarget = {
  playerId: string;
  displayName: string;
  position: string | null;
  rated: boolean;
};

export async function rateTargets(matchId: string): Promise<RateTarget[]> {
  const { data, error } = await supabase().rpc('rate_targets', { p_match_id: matchId });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    playerId: r.player_id,
    displayName: r.display_name,
    position: r.position_code,
    rated: r.rated,
  }));
}

/**
 * PRO-008. Every rule about who may rate whom is enforced server-side, so this
 * reports the reason rather than pre-checking anything the client cannot know.
 */
export async function submitPeerRating(
  matchId: string,
  subjectId: string,
  attributes: Record<string, number>,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('submit_peer_rating', {
    p_match_id: matchId,
    p_subject_id: subjectId,
    p_attributes: attributes,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

/** MCH-001: a checked-in booking becomes a match, with a score if known. */
export async function completeMatch(
  bookingId: string,
  scoreHome?: number | null,
  scoreAway?: number | null,
): Promise<{ ok: boolean; matchId?: string; reason?: string }> {
  const { data, error } = await supabase().rpc('complete_match', {
    p_booking_id: bookingId,
    p_score_home: scoreHome ?? null,
    p_score_away: scoreAway ?? null,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true, matchId: row.match_id } : { ok: false, reason: row.reason ?? undefined };
}

/** The six outfield attributes, in the order the card lays them out. */
export const RATEABLE = ['SPD', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'] as const;
export const RATEABLE_GK = ['DIV', 'HAN', 'KIC', 'REF', 'SPD', 'POS'] as const;

export const ATTRIBUTE_LABEL: Record<string, string> = {
  SPD: 'Pace',
  SHO: 'Shooting',
  PAS: 'Passing',
  DRI: 'Dribbling',
  DEF: 'Defending',
  PHY: 'Physical',
  DIV: 'Diving',
  HAN: 'Handling',
  KIC: 'Kicking',
  REF: 'Reflexes',
  POS: 'Positioning',
};
