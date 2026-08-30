import { supabase } from '@/lib/supabase';

/**
 * Clubs.
 *
 * Not teams. A team is who you are playing with on Thursday; a club is a
 * standing side with a name, a crest and a record, and it is the thing that
 * enters a league. The two data modules stay separate for the same reason the
 * two tables do.
 *
 * Every count of the squad comes from the server, never from the length of the
 * list this module happens to hold — a captain who does not play is in the club
 * and not in the squad, and a client counting rows would get that wrong.
 */

export type SlotKind = 'starter' | 'sub';
export type MembershipState = 'invited' | 'active' | 'declined' | 'left' | 'removed';

export type ClubSummary = {
  clubId: string;
  name: string;
  crestUrl: string | null;
  homeArea: string | null;
  role: 'captain' | 'player';
  /** Null means a member who does not take the field. */
  slotKind: SlotKind | null;
  state: MembershipState;
  isCaptain: boolean;
  trophies: number;
  playing: number;
  eligible: boolean;
};

export async function myClubs(): Promise<ClubSummary[]> {
  const { data, error } = await supabase().rpc('my_clubs');
  if (error) throw error;
  return (data as any[]).map((r) => ({
    clubId: r.club_id,
    name: r.name,
    crestUrl: r.crest_url,
    homeArea: r.home_area,
    role: r.role,
    slotKind: r.slot_kind,
    state: r.state,
    isCaptain: r.is_captain,
    trophies: r.trophies,
    playing: r.playing,
    eligible: r.eligible,
  }));
}

export type ClubDetail = {
  clubId: string;
  name: string;
  crestUrl: string | null;
  homeArea: string | null;
  captainId: string;
  captainName: string;
  captainPlays: boolean;
  trophies: number;
  starters: number;
  subs: number;
  playing: number;
  eligible: boolean;
  /** What the club is short of, in words. Null when it is short of nothing. */
  reason: string | null;
};

export async function clubDetail(clubId: string): Promise<ClubDetail | null> {
  const { data, error } = await supabase().rpc('club_detail', { p_club_id: clubId });
  if (error) throw error;
  const rows = data as any[];
  if (!rows.length) return null;
  const r = rows[0];
  return {
    clubId: r.club_id,
    name: r.name,
    crestUrl: r.crest_url,
    homeArea: r.home_area,
    captainId: r.captain_id,
    captainName: r.captain_name,
    captainPlays: r.captain_plays,
    trophies: r.trophies,
    starters: r.starters,
    subs: r.subs,
    playing: r.playing,
    eligible: r.eligible,
    reason: r.reason,
  };
}

export type ClubMember = {
  playerId: string;
  displayName: string;
  photoUrl: string | null;
  role: 'captain' | 'player';
  slotKind: SlotKind | null;
  state: MembershipState;
  isCaptain: boolean;
  ovr: number | null;
};

export async function clubSquad(clubId: string): Promise<ClubMember[]> {
  const { data, error } = await supabase().rpc('club_squad', { p_club_id: clubId });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    playerId: r.player_id,
    displayName: r.display_name,
    photoUrl: r.photo_url,
    role: r.role,
    slotKind: r.slot_kind,
    state: r.state,
    isCaptain: r.is_captain,
    ovr: r.ovr,
  }));
}

export type Honour = { title: string; wonOn: string; tournamentId: string | null; region: string | null };

export async function clubHonours(clubId: string): Promise<Honour[]> {
  const { data, error } = await supabase().rpc('club_honours', { p_club_id: clubId });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    title: r.title,
    wonOn: r.won_on,
    tournamentId: r.tournament_id,
    region: r.region,
  }));
}

type Outcome = { ok: boolean; reason?: string };

function outcome(rows: any[]): Outcome {
  const r = rows[0];
  return { ok: !!r?.ok, reason: r?.reason ?? undefined };
}

export async function createClub(
  name: string,
  homeArea?: string,
  captainSlot?: SlotKind | null,
): Promise<Outcome & { clubId?: string }> {
  const { data, error } = await supabase().rpc('create_club', {
    p_name: name,
    p_home_area: homeArea ?? null,
    p_captain_slot: captainSlot ?? null,
  });
  if (error) throw error;
  const r = (data as any[])[0];
  return { ok: !!r?.ok, reason: r?.reason ?? undefined, clubId: r?.club_id ?? undefined };
}

export async function setClubCrest(clubId: string, url: string | null): Promise<Outcome> {
  const { data, error } = await supabase().rpc('set_club_crest', { p_club_id: clubId, p_url: url });
  if (error) throw error;
  return outcome(data as any[]);
}

export async function inviteToClub(
  clubId: string,
  playerId: string,
  slotKind: SlotKind | null,
): Promise<Outcome> {
  const { data, error } = await supabase().rpc('invite_to_club', {
    p_club_id: clubId,
    p_player_id: playerId,
    p_slot_kind: slotKind,
  });
  if (error) throw error;
  return outcome(data as any[]);
}

export async function respondToClubInvite(clubId: string, accept: boolean): Promise<Outcome> {
  const { data, error } = await supabase().rpc('respond_to_club_invite', {
    p_club_id: clubId,
    p_accept: accept,
  });
  if (error) throw error;
  return outcome(data as any[]);
}

export async function setClubSlot(
  clubId: string,
  playerId: string,
  slotKind: SlotKind | null,
): Promise<Outcome> {
  const { data, error } = await supabase().rpc('set_club_slot', {
    p_club_id: clubId,
    p_player_id: playerId,
    p_slot_kind: slotKind,
  });
  if (error) throw error;
  return outcome(data as any[]);
}

export async function removeFromClub(clubId: string, playerId: string): Promise<Outcome> {
  const { data, error } = await supabase().rpc('remove_from_club', {
    p_club_id: clubId,
    p_player_id: playerId,
  });
  if (error) throw error;
  return outcome(data as any[]);
}

export async function leaveClub(clubId: string): Promise<Outcome> {
  const { data, error } = await supabase().rpc('leave_club', { p_club_id: clubId });
  if (error) throw error;
  return outcome(data as any[]);
}

export async function handOverClub(clubId: string, playerId: string): Promise<Outcome> {
  const { data, error } = await supabase().rpc('hand_over_club', {
    p_club_id: clubId,
    p_player_id: playerId,
  });
  if (error) throw error;
  return outcome(data as any[]);
}
