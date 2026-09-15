import { supabase } from '@/lib/supabase';

/**
 * Who you are playing.
 *
 * A booking is an hour on a pitch; a match is an hour on a pitch against
 * somebody. This is the second half — the captain names an opponent, the
 * opponent is asked, and the fixture is real only once they have answered.
 *
 * Nothing here decides anything. Whether a challenge may be sent, and who is
 * entitled to answer it, is settled on the server: a club's captain speaks for
 * the club and its members do not, and that rule lives in one place so a screen
 * cannot disagree with what the write will allow.
 */

/** Invited, and not yet answered, is a state the captain's screen has to show. */
export type ChallengeState = 'invited' | 'accepted' | 'declined' | 'withdrawn';

export type Opponent = {
  challengeId: string;
  state: ChallengeState;
  /** A player or a club — they read differently and are reached differently. */
  kind: 'player' | 'club';
  opponentId: string;
  displayName: string;
  imageUrl: string | null;
  note: string | null;
  /** Whether the person reading this is the one who owes an answer. */
  mineToAnswer: boolean;
};

/** An invitation waiting on the reader, from their side of it. */
export type Challenge = {
  challengeId: string;
  bookingId: string;
  /** The club it was sent to, when it was sent to a club rather than to them. */
  asClub: string | null;
  fromName: string;
  venueName: string;
  pitchLabel: string;
  startsAt: string;
  note: string | null;
};

export async function bookingOpponent(bookingId: string): Promise<Opponent | null> {
  const { data, error } = await supabase().rpc('booking_opponent', {
    p_booking_id: bookingId,
  });
  if (error) throw error;
  const r = (data as any[])[0];
  if (!r) return null;
  return {
    challengeId: r.challenge_id,
    state: r.state,
    kind: r.kind,
    opponentId: r.opponent_id,
    displayName: r.display_name,
    imageUrl: r.image_url ?? null,
    note: r.note ?? null,
    mineToAnswer: Boolean(r.mine_to_answer),
  };
}

export async function challengeOpponent(
  bookingId: string,
  opponent: { playerId: string } | { clubId: string },
  note?: string,
): Promise<{ ok: true; challengeId: string } | { ok: false; reason: string }> {
  const { data, error } = await supabase().rpc('challenge_opponent', {
    p_booking_id: bookingId,
    p_player_id: 'playerId' in opponent ? opponent.playerId : null,
    p_club_id: 'clubId' in opponent ? opponent.clubId : null,
    p_note: note?.trim() || null,
  });
  if (error) throw error;
  const r = (data as any[])[0];
  return r?.ok
    ? { ok: true, challengeId: r.challenge_id }
    : { ok: false, reason: r?.reason ?? 'That booking is not on any more.' };
}

export async function respondToChallenge(
  challengeId: string,
  accept: boolean,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('respond_to_challenge', {
    p_challenge_id: challengeId,
    p_accept: accept,
  });
  if (error) throw error;
  const r = (data as any[])[0];
  return r?.ok ? { ok: true } : { ok: false, reason: r?.reason ?? undefined };
}

/** Calling it off. Keyed on the booking, because that is what the captain has. */
export async function withdrawChallenge(
  bookingId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('withdraw_challenge', {
    p_booking_id: bookingId,
  });
  if (error) throw error;
  const r = (data as any[])[0];
  return r?.ok ? { ok: true } : { ok: false, reason: r?.reason ?? undefined };
}

export async function myChallenges(): Promise<Challenge[]> {
  const { data, error } = await supabase().rpc('my_challenges');
  if (error) throw error;
  return (data as any[]).map((r) => ({
    challengeId: r.challenge_id,
    bookingId: r.booking_id,
    asClub: r.as_club ?? null,
    fromName: r.from_name,
    venueName: r.venue_name,
    pitchLabel: r.pitch_label,
    startsAt: r.starts_at,
    note: r.note ?? null,
  }));
}

export type FoundClub = {
  clubId: string;
  name: string;
  crestUrl: string | null;
  homeArea: string | null;
  trophies: number;
  /** Theirs to run, and so not theirs to play. */
  mine: boolean;
};

/**
 * Clubs by name, for picking one to play.
 *
 * Only admitted clubs come back, and a captain's own club comes back marked
 * rather than hidden — searching for it and finding nothing reads as a broken
 * search rather than as a rule.
 */
export async function findClubs(query: string, limit = 20): Promise<FoundClub[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase().rpc('find_clubs', { p_query: q, p_limit: limit });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    clubId: r.club_id,
    name: r.name,
    crestUrl: r.crest_url ?? null,
    homeArea: r.home_area ?? null,
    trophies: r.trophies ?? 0,
    mine: Boolean(r.mine),
  }));
}
