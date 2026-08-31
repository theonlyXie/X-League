import { supabase } from '@/lib/supabase';

/**
 * Owner Mode configuration (O-03 – O-08) and the admin console (A-02 – A-08).
 *
 * Every function here checks authority on the server. The client calls
 * `myPlatformRole` and `my_venues` only to decide which doors to *offer* — it
 * never decides who may walk through one.
 */

// ---------------------------------------------------------------------------
// O-02 Hours and pitches
// ---------------------------------------------------------------------------

/**
 * `availability_rule` is what `search_availability` builds every sellable slot
 * from. Before `venue_hours` and `set_venue_hours` it was read in five places
 * and written in none outside the seed, so a venue registered through the
 * product had no hours it could change and no pitch it could add.
 */
export type VenueHour = {
  pitchId: string;
  pitchLabel: string;
  dayOfWeek: number;
  openHour: number | null;
  closeHour: number | null;
};

export async function venueHours(venueId: string): Promise<VenueHour[]> {
  const { data, error } = await supabase().rpc('venue_hours', { p_venue_id: venueId });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    pitchId: r.pitch_id,
    pitchLabel: r.pitch_label,
    dayOfWeek: r.day_of_week,
    openHour: r.open_hour,
    closeHour: r.close_hour,
  }));
}

/** Equal hours closes the day — that is how a venue says it does not open. */
export async function setVenueHours(
  pitchId: string,
  dayOfWeek: number,
  openHour: number,
  closeHour: number,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('set_venue_hours', {
    p_pitch_id: pitchId,
    p_day_of_week: dayOfWeek,
    p_open_hour: openHour,
    p_close_hour: closeHour,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

export async function addPitch(
  venueId: string,
  label: string,
  format?: string,
): Promise<{ ok: boolean; pitchId?: string; reason?: string }> {
  const { data, error } = await supabase().rpc('add_pitch', {
    p_venue_id: venueId,
    p_label: label,
    ...(format ? { p_format: format } : null),
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true, pitchId: row.pitch_id } : { ok: false, reason: row.reason ?? undefined };
}

/**
 * Rename a pitch or take it out of service. Arguments left out are left alone
 * — the SQL coalesces against the current row, and PostgREST applies a default
 * only to a key the body omits, so omitting is not the same as sending null.
 */
export async function updatePitch(
  pitchId: string,
  changes: { label?: string; format?: string; operational?: boolean },
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('update_pitch', {
    p_pitch_id: pitchId,
    ...(changes.label !== undefined ? { p_label: changes.label } : null),
    ...(changes.format !== undefined ? { p_format: changes.format } : null),
    ...(changes.operational !== undefined ? { p_operational: changes.operational } : null),
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

// ---------------------------------------------------------------------------
// O-03 Pricing
// ---------------------------------------------------------------------------

export type PriceRule = {
  ruleId: string;
  pitchId: string;
  pitchLabel: string;
  startHour: number;
  endHour: number;
  priceEgp: number;
  depositEgp: number;
  validFrom: string;
  validTo: string | null;
  /** True for the rule actually in force today. */
  live: boolean;
};

export async function venuePriceRules(venueId: string): Promise<PriceRule[]> {
  const { data, error } = await supabase().rpc('venue_price_rules', { p_venue_id: venueId });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    ruleId: r.rule_id,
    pitchId: r.pitch_id,
    pitchLabel: r.pitch_label,
    startHour: r.start_hour,
    endHour: r.end_hour,
    priceEgp: r.price_egp,
    depositEgp: r.deposit_egp,
    validFrom: r.valid_from,
    validTo: r.valid_to,
    live: r.live,
  }));
}

/**
 * OWN-007. A new rule supersedes rather than overwrites: the old one is closed
 * as of today and its uncovered hours carry forward at the old price, so
 * narrowing a band cannot leave the rest of the evening unpriced.
 */
export async function setPriceRule(
  pitchId: string,
  startHour: number,
  endHour: number,
  priceEgp: number,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('set_price_rule', {
    p_pitch_id: pitchId,
    p_start_hour: startHour,
    p_end_hour: endHour,
    p_price_egp: priceEgp,
    p_valid_from: null,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

// ---------------------------------------------------------------------------
// O-04 Closures
// ---------------------------------------------------------------------------

export type Closure = {
  exceptionId: string;
  pitchId: string;
  pitchLabel: string;
  startsAt: string;
  endsAt: string;
  kind: 'closure' | 'maintenance' | 'private' | 'holiday';
  note: string | null;
};

export async function venueClosures(venueId: string, from?: string): Promise<Closure[]> {
  const { data, error } = await supabase().rpc('venue_closures', {
    p_venue_id: venueId,
    p_from: from ?? null,
  });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    exceptionId: r.exception_id,
    pitchId: r.pitch_id,
    pitchLabel: r.pitch_label,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    kind: r.kind,
    note: r.note,
  }));
}

/** OWN-004. Refused if somebody has already bought the hour. */
export async function closeSlot(
  pitchId: string,
  startsAt: string,
  opts: { minutes?: number; kind?: Closure['kind']; note?: string } = {},
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('close_slot', {
    p_pitch_id: pitchId,
    p_starts_at: startsAt,
    p_minutes: opts.minutes ?? 60,
    p_kind: opts.kind ?? 'closure',
    p_note: opts.note ?? null,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

export async function reopenSlot(exceptionId: string): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('reopen_slot', { p_exception_id: exceptionId });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

// ---------------------------------------------------------------------------
// O-05 Staff
// ---------------------------------------------------------------------------

export type VenueRole = 'staff' | 'manager' | 'owner';

export type StaffMember = {
  userId: string;
  displayName: string;
  role: VenueRole;
  active: boolean;
  since: string;
};

export async function venueStaffList(venueId: string): Promise<StaffMember[]> {
  const { data, error } = await supabase().rpc('venue_staff_list', { p_venue_id: venueId });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    role: r.role,
    active: r.active,
    since: r.since,
  }));
}

/** OWN-014: a manager cannot grant a role above their own, nor change their own. */
export async function setVenueStaff(
  venueId: string,
  userId: string,
  role: VenueRole,
  active = true,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('set_venue_staff', {
    p_venue_id: venueId,
    p_user_id: userId,
    p_role: role,
    p_active: active,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

// ---------------------------------------------------------------------------
// O-06 Payouts
// ---------------------------------------------------------------------------

export type PayoutRow = {
  onDate: string;
  bookings: number;
  grossEgp: number;
  collectedEgp: number;
  outstandingEgp: number;
  forfeitedEgp: number;
};

/** OWN-011: built from payment obligations, not from booking states. */
export async function venuePayouts(
  venueId: string,
  from?: string,
  to?: string,
): Promise<PayoutRow[]> {
  const { data, error } = await supabase().rpc('venue_payouts', {
    p_venue_id: venueId,
    p_from: from ?? null,
    p_to: to ?? null,
    p_tz: 'Africa/Cairo',
  });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    onDate: r.on_date,
    bookings: r.bookings,
    grossEgp: r.gross_egp,
    collectedEgp: r.collected_egp,
    outstandingEgp: r.outstanding_egp,
    forfeitedEgp: r.forfeited_egp,
  }));
}

export type VenueCustomer = {
  /** Stable across reloads — the account id, or the folded name for a walk-in. */
  key: string;
  name: string;
  /** False for somebody the venue booked in over the phone or at the desk. */
  hasAccount: boolean;
  bookings: number;
  noShows: number;
  lastVisit: string;
  /** What their hours sold for, and what the gate actually took. Different questions. */
  grossEgp: number;
  collectedEgp: number;
};

/** Who plays here, and how often. Grouped by account where there is one. */
export async function venueCustomers(venueId: string, limit = 100): Promise<VenueCustomer[]> {
  const { data, error } = await supabase().rpc('venue_customers', {
    p_venue_id: venueId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    key: r.customer_key,
    name: r.display_name,
    hasAccount: r.has_account,
    bookings: r.bookings,
    noShows: r.no_shows,
    lastVisit: r.last_visit,
    grossEgp: r.gross_egp,
    collectedEgp: r.collected_egp,
  }));
}

// ---------------------------------------------------------------------------
// O-07 / O-08 Profile and reviews
// ---------------------------------------------------------------------------

export async function updateVenueProfile(
  venueId: string,
  patch: {
    name?: string;
    area?: string;
    phone?: string;
    entryNote?: string;
    houseRules?: string;
    amenities?: string[];
    mapUrl?: string;
    lat?: number;
    lon?: number;
  },
): Promise<{ ok: boolean; reason?: string }> {
  // `p_lat` and `p_lon` were hardcoded null here and no screen passed a map
  // link either, so nothing in the product could put a venue on a map. The
  // "Navigate" button on Home and on the confirmation screen builds its URL
  // from exactly those three columns, so it did nothing at all, silently, for
  // every venue in the database.
  const { data, error } = await supabase().rpc('update_venue_profile', {
    p_venue_id: venueId,
    p_name: patch.name ?? null,
    p_area: patch.area ?? null,
    p_phone: patch.phone ?? null,
    p_entry_note: patch.entryNote ?? null,
    p_house_rules: patch.houseRules ?? null,
    p_amenities: patch.amenities ?? null,
    p_map_url: patch.mapUrl ?? null,
    p_lat: patch.lat ?? null,
    p_lon: patch.lon ?? null,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

/**
 * Lists a ground under this account, for somebody who joined as a player.
 *
 * The same work sign-up does for a venue owner, addressed to an account that
 * already exists — there is no owner flag to set, because Owner Mode is drawn
 * from `my_venues` and listing the ground *is* the promotion.
 */
export async function registerMyVenue(
  name: string,
  area: string,
): Promise<{ ok: true; venueId: string } | { ok: false; reason?: string }> {
  const { data, error } = await supabase().rpc('register_my_venue', {
    p_name: name,
    p_area: area,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row?.ok
    ? { ok: true, venueId: row.venue_id as string }
    : { ok: false, reason: row?.reason ?? undefined };
}

export type StaffVenueRow = { venueId: string; name: string; role: VenueRole };

/**
 * The venues this person staffs. The session provider reads the same function
 * on sign-in, but the sign-in screen has to decide where to land before that
 * state has settled, so it asks directly.
 */
export async function myVenues(): Promise<StaffVenueRow[]> {
  const { data, error } = await supabase().rpc('my_venues');
  if (error) throw error;
  return (data as any[]).map((r) => ({ venueId: r.venue_id, name: r.name, role: r.role }));
}

export type ReviewSummary = {
  ratingAvg: number | null;
  ratingCount: number;
  histogram: { stars: number; count: number }[];
};

export async function venueReviewSummary(venueId: string): Promise<ReviewSummary | null> {
  const { data, error } = await supabase().rpc('venue_review_summary', { p_venue_id: venueId });
  if (error) throw error;
  const rows = data as any[];
  if (!rows.length) return null;
  const r = rows[0];
  return {
    ratingAvg: r.rating_avg === null ? null : Number(r.rating_avg),
    ratingCount: r.rating_count,
    histogram: [
      { stars: 5, count: r.five },
      { stars: 4, count: r.four },
      { stars: 3, count: r.three },
      { stars: 2, count: r.two },
      { stars: 1, count: r.one },
    ],
  };
}

/** BKG-007: the gate collecting cash, recorded as a payment event. */
export async function recordPayment(
  bookingId: string,
  reference?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('record_payment', {
    p_booking_id: bookingId,
    p_kind: 'balance',
    p_reference: reference ?? null,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

/** BKG-010: only the venue, and only once the hour has begun. */
export async function markNoShow(bookingId: string): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('mark_no_show', { p_booking_id: bookingId });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

// ---------------------------------------------------------------------------
// The admin console
// ---------------------------------------------------------------------------

export type PlatformRole = 'support' | 'moderator' | 'admin';

/** Which console this person may open, or null. Drives what the client offers. */
export async function myPlatformRole(): Promise<PlatformRole | null> {
  const { data, error } = await supabase().rpc('my_platform_role');
  if (error) throw error;
  return (data as PlatformRole | null) ?? null;
}

export type PendingVenue = {
  venueId: string;
  name: string;
  area: string | null;
  verification: string;
  phone: string | null;
  pitches: number;
  bookings: number;
  createdAt: string;
};

export async function adminVerificationQueue(): Promise<PendingVenue[]> {
  const { data, error } = await supabase().rpc('admin_verification_queue');
  if (error) throw error;
  return (data as any[]).map((r) => ({
    venueId: r.venue_id,
    name: r.name,
    area: r.area,
    verification: r.verification,
    phone: r.phone,
    pitches: r.pitches,
    bookings: r.bookings,
    createdAt: r.created_at,
  }));
}

export async function adminSetVerification(
  venueId: string,
  verification: 'pending' | 'verified' | 'rejected' | 'suspended',
  note?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('admin_set_verification', {
    p_venue_id: venueId,
    p_verification: verification,
    p_note: note ?? null,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

export type AdminReport = {
  reportId: string;
  reporter: string;
  subjectKind: string;
  subjectId: string;
  subjectName: string | null;
  reason: string;
  body: string | null;
  state: string;
  createdAt: string;
};

export async function adminReports(state = 'open', limit = 50): Promise<AdminReport[]> {
  const { data, error } = await supabase().rpc('admin_reports', {
    p_state: state,
    p_limit: limit,
  });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    reportId: r.report_id,
    reporter: r.reporter,
    subjectKind: r.subject_kind,
    subjectId: r.subject_id,
    subjectName: r.subject_name,
    reason: r.reason,
    body: r.body,
    state: r.state,
    createdAt: r.created_at,
  }));
}

export async function adminResolveReport(
  reportId: string,
  state: 'reviewing' | 'actioned' | 'dismissed',
  resolution?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('admin_resolve_report', {
    p_report_id: reportId,
    p_state: state,
    p_resolution: resolution ?? null,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

export type AdminUser = {
  playerId: string;
  displayName: string;
  area: string | null;
  visibility: string;
  suspendedUntil: string | null;
  bookings: number;
  noShows: number;
  joined: string;
};

export async function adminFindUsers(query?: string, limit = 50): Promise<AdminUser[]> {
  const { data, error } = await supabase().rpc('admin_find_users', {
    p_query: query ?? null,
    p_limit: limit,
  });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    playerId: r.player_id,
    displayName: r.display_name,
    area: r.area,
    visibility: r.visibility,
    suspendedUntil: r.suspended_until,
    bookings: r.bookings,
    noShows: r.no_shows,
    joined: r.joined,
  }));
}

/** ADM-010: days of 0 or less lifts the suspension. */
export async function adminSuspendUser(
  playerId: string,
  days: number,
  reason?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('admin_suspend_user', {
    p_player_id: playerId,
    p_days: days,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

export type AdminOverview = {
  venuesTotal: number;
  venuesVerified: number;
  venuesPending: number;
  players: number;
  bookings: number;
  matches: number;
  gmvEgp: number;
  collectedEgp: number;
  openReports: number;
  noShowRate: number;
};

export async function adminOverview(days = 30): Promise<AdminOverview | null> {
  const { data, error } = await supabase().rpc('admin_overview', {
    p_days: days,
    p_tz: 'Africa/Cairo',
  });
  if (error) throw error;
  const rows = data as any[];
  if (!rows.length) return null;
  const r = rows[0];
  return {
    venuesTotal: r.venues_total,
    venuesVerified: r.venues_verified,
    venuesPending: r.venues_pending,
    players: r.players,
    bookings: r.bookings,
    matches: r.matches,
    gmvEgp: r.gmv_egp,
    collectedEgp: r.collected_egp,
    openReports: r.open_reports,
    noShowRate: Number(r.no_show_rate),
  };
}

export type LedgerRow = {
  venueId: string;
  venueName: string;
  bookings: number;
  grossEgp: number;
  collectedEgp: number;
  outstandingEgp: number;
  forfeitedEgp: number;
};

export async function adminLedger(days = 30): Promise<LedgerRow[]> {
  const { data, error } = await supabase().rpc('admin_ledger', { p_days: days });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    venueId: r.venue_id,
    venueName: r.venue_name,
    bookings: r.bookings,
    grossEgp: r.gross_egp,
    collectedEgp: r.collected_egp,
    outstandingEgp: r.outstanding_egp,
    forfeitedEgp: r.forfeited_egp,
  }));
}

export type Setting = {
  key: string;
  value: number;
  description: string;
  updatedAt: string;
};

export async function adminSettings(): Promise<Setting[]> {
  const { data, error } = await supabase().rpc('admin_settings');
  if (error) throw error;
  return (data as any[]).map((r) => ({
    key: r.key,
    value: r.value,
    description: r.description,
    updatedAt: r.updated_at,
  }));
}

export async function adminSetSetting(
  key: string,
  value: number,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('admin_set_setting', {
    p_key: key,
    p_value: value,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

/**
 * AUTH: a person changing their own password.
 *
 * `change_password` has been granted and tested since the password migration
 * and had no caller in either client, so nobody using this product could
 * change their password — including the staff account whose password has been
 * typed into a chat window.
 */
export async function changePassword(
  current: string,
  next: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('change_password', {
    p_current: current,
    p_new: next,
  });
  if (error) throw error;
  const row = (data as any[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

export type AuditEntry = {
  at: string;
  actor: string;
  action: string;
  subjectKind: string;
  subjectId: string | null;
  detail: Record<string, unknown>;
};

export async function adminAudit(limit = 100): Promise<AuditEntry[]> {
  const { data, error } = await supabase().rpc('admin_audit', {
    p_limit: limit,
    p_subject_id: null,
  });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    at: r.at,
    actor: r.actor,
    action: r.action,
    subjectKind: r.subject_kind,
    subjectId: r.subject_id,
    detail: r.detail ?? {},
  }));
}
