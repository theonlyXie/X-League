import { supabase } from '@/lib/supabase';

/**
 * Squads, invitations and teams.
 *
 * The lobby's counts come from `squadCounts` rather than from counting the
 * roster the client happens to hold: a player may only be shown part of a squad
 * and would otherwise report "3 of 5" for a match that is full.
 */

export type SquadMember = {
  participantId: string;
  playerId: string | null;
  displayName: string;
  slotKind: 'starter' | 'sub';
  position: string | null;
  state: 'invited' | 'accepted' | 'declined' | 'withdrawn' | 'removed';
  isCaptain: boolean;
  /** The card as it stood at read time; null for a guest with no account. */
  ovr: number | null;
};

export async function bookingSquad(bookingId: string): Promise<SquadMember[]> {
  const { data, error } = await supabase().rpc('booking_squad', { p_booking_id: bookingId });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    participantId: r.participant_id,
    playerId: r.player_id,
    displayName: r.display_name,
    slotKind: r.slot_kind,
    position: r.position_code,
    state: r.state,
    isCaptain: r.is_captain,
    ovr: r.ovr,
  }));
}

export type SquadCounts = {
  acceptedStarters: number;
  starterCapacity: number;
  acceptedSubs: number;
  subCapacity: number;
  pending: number;
};

export async function squadCounts(bookingId: string): Promise<SquadCounts | null> {
  const { data, error } = await supabase().rpc('squad_counts', { p_booking_id: bookingId });
  if (error) throw error;
  const rows = data as any[];
  if (!rows.length) return null;
  const r = rows[0];
  return {
    acceptedStarters: r.accepted_starters,
    starterCapacity: r.starter_capacity,
    acceptedSubs: r.accepted_subs,
    subCapacity: r.sub_capacity,
    pending: r.pending,
  };
}

/**
 * P-07. Either a player id or a guest name — a guest has no account to accept
 * with, so their place is taken as given rather than left pending forever.
 */
export async function inviteToBooking(
  bookingId: string,
  who: { playerId?: string; guestName?: string },
  opts: { slotKind?: 'starter' | 'sub'; position?: string } = {},
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('invite_to_booking', {
    p_booking_id: bookingId,
    p_player_id: who.playerId ?? null,
    p_guest_name: who.guestName ?? null,
    p_slot_kind: opts.slotKind ?? 'starter',
    p_position: opts.position ?? null,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

export async function respondToInvitation(
  participantId: string,
  accept: boolean,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('respond_to_invitation', {
    p_participant_id: participantId,
    p_accept: accept,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

export async function leaveBooking(bookingId: string): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('leave_booking', { p_booking_id: bookingId });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

export async function removeParticipant(
  participantId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('remove_participant', {
    p_participant_id: participantId,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

export type Invitation = {
  participantId: string;
  bookingId: string;
  startsAt: string;
  venueName: string;
  area: string | null;
  pitchLabel: string;
  slotKind: 'starter' | 'sub';
  position: string | null;
  fromName: string;
  priceEgp: number;
};

/** P-02's invitation card, which was a fixture. */
export async function myInvitations(): Promise<Invitation[]> {
  const { data, error } = await supabase().rpc('my_invitations');
  if (error) throw error;
  return (data as any[]).map((r) => ({
    participantId: r.participant_id,
    bookingId: r.booking_id,
    startsAt: r.starts_at,
    venueName: r.venue_name,
    area: r.area,
    pitchLabel: r.pitch_label,
    slotKind: r.slot_kind,
    position: r.position_code,
    fromName: r.from_name,
    priceEgp: r.price_egp,
  }));
}

export type SquadMatch = {
  bookingId: string;
  startsAt: string;
  venueName: string;
  area: string | null;
  pitchLabel: string;
  slotKind: 'starter' | 'sub';
  isCaptain: boolean;
};

/** Matches the player is in but did not book, so Home works for a squad member. */
export async function mySquadMatches(limit = 10): Promise<SquadMatch[]> {
  const { data, error } = await supabase().rpc('my_squad_matches', { p_limit: limit });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    bookingId: r.booking_id,
    startsAt: r.starts_at,
    venueName: r.venue_name,
    area: r.area,
    pitchLabel: r.pitch_label,
    slotKind: r.slot_kind,
    isCaptain: r.is_captain,
  }));
}

export type FoundPlayer = {
  playerId: string;
  displayName: string;
  preferredArea: string | null;
  ovr: number | null;
  position: string | null;
};

/**
 * P-11. PRO-006 visibility is applied on the server, so a short or empty query
 * genuinely returns nothing rather than the client filtering a full list it
 * should never have received.
 */
export async function findPlayers(query: string, limit = 20): Promise<FoundPlayer[]> {
  const { data, error } = await supabase().rpc('find_players', {
    p_query: query,
    p_limit: limit,
  });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    playerId: r.player_id,
    displayName: r.display_name,
    preferredArea: r.preferred_area,
    ovr: r.ovr,
    position: r.position_code,
  }));
}

export type Team = {
  teamId: string;
  name: string;
  homeArea: string | null;
  crestHue: number | null;
  role: 'captain' | 'player';
  state: 'invited' | 'active' | 'declined' | 'left' | 'removed';
  members: number;
};

export async function myTeams(): Promise<Team[]> {
  const { data, error } = await supabase().rpc('my_teams');
  if (error) throw error;
  return (data as any[]).map((r) => ({
    teamId: r.team_id,
    name: r.name,
    homeArea: r.home_area,
    crestHue: r.crest_hue,
    role: r.role,
    state: r.state,
    members: r.members,
  }));
}

export type TeamMember = {
  playerId: string;
  displayName: string;
  role: 'captain' | 'player';
  state: 'invited' | 'active' | 'declined' | 'left' | 'removed';
  ovr: number | null;
  position: string | null;
};

export async function teamRoster(teamId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase().rpc('team_roster', { p_team_id: teamId });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    playerId: r.player_id,
    displayName: r.display_name,
    role: r.role,
    state: r.state,
    ovr: r.ovr,
    position: r.position_code,
  }));
}

export async function createTeam(
  name: string,
  homeArea?: string,
  crestHue?: number,
): Promise<{ ok: boolean; teamId?: string; reason?: string }> {
  const { data, error } = await supabase().rpc('create_team', {
    p_name: name,
    p_home_area: homeArea ?? null,
    p_crest_hue: crestHue ?? null,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true, teamId: row.team_id } : { ok: false, reason: row.reason ?? undefined };
}

export async function inviteToTeam(
  teamId: string,
  playerId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('invite_to_team', {
    p_team_id: teamId,
    p_player_id: playerId,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

export async function respondToTeamInvite(
  teamId: string,
  accept: boolean,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('respond_to_team_invite', {
    p_team_id: teamId,
    p_accept: accept,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}
