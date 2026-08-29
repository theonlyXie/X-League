'use client';

import { outcome, supabase } from './supabase';

/**
 * Everything the platform runs on, other than cups.
 *
 * Each of these is an `admin_*` RPC that checks `is_platform(...)` in its first
 * statement, so nothing here decides who may do what — it reports whatever the
 * server said. A support account sees the same pages and gets refused on the
 * actions it may not take, in the server's own words rather than a guess made
 * in the browser.
 *
 * snake_case becomes camelCase once, here.
 */

type Row = Record<string, unknown>;
const rows = (data: unknown) => (data ?? []) as Row[];

async function call(fn: string, args: Record<string, unknown> = {}): Promise<Row[]> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw error;
  return rows(data);
}

type Result = { ok: true } | { ok: false; reason: string };

async function act(fn: string, args: Record<string, unknown>): Promise<Result> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) return { ok: false, reason: error.message };
  const res = outcome(data);
  return res.ok ? { ok: true } : { ok: false, reason: res.reason };
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export type Overview = {
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

export async function overview(days = 30): Promise<Overview | null> {
  const r = (await call('admin_overview', { p_days: days }))[0];
  if (!r) return null;
  return {
    venuesTotal: r.venues_total as number,
    venuesVerified: r.venues_verified as number,
    venuesPending: r.venues_pending as number,
    players: r.players as number,
    bookings: r.bookings as number,
    matches: r.matches as number,
    gmvEgp: r.gmv_egp as number,
    collectedEgp: r.collected_egp as number,
    openReports: r.open_reports as number,
    noShowRate: Number(r.no_show_rate ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Venues
// ---------------------------------------------------------------------------

export type Venue = {
  venueId: string;
  name: string;
  area: string | null;
  verification: string;
  pitches: number;
};

export async function allVenues(): Promise<Venue[]> {
  return (await call('admin_venues')).map((r) => ({
    venueId: r.venue_id as string,
    name: r.name as string,
    area: (r.area as string) ?? null,
    verification: r.verification as string,
    pitches: r.pitches as number,
  }));
}

export type PendingVenue = Venue & {
  phone: string | null;
  bookings: number;
  createdAt: string;
};

export async function verificationQueue(): Promise<PendingVenue[]> {
  return (await call('admin_verification_queue')).map((r) => ({
    venueId: r.venue_id as string,
    name: r.name as string,
    area: (r.area as string) ?? null,
    verification: r.verification as string,
    phone: (r.phone as string) ?? null,
    pitches: r.pitches as number,
    bookings: r.bookings as number,
    createdAt: r.created_at as string,
  }));
}

export const setVerification = (venueId: string, verification: string, note?: string) =>
  act('admin_set_verification', {
    p_venue_id: venueId,
    p_verification: verification,
    p_note: note ?? null,
  });

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export type User = {
  playerId: string;
  displayName: string;
  area: string | null;
  visibility: string;
  suspendedUntil: string | null;
  bookings: number;
  noShows: number;
  joined: string;
};

export async function findUsers(query?: string, limit = 50): Promise<User[]> {
  return (await call('admin_find_users', { p_query: query ?? null, p_limit: limit })).map((r) => ({
    playerId: r.player_id as string,
    displayName: r.display_name as string,
    area: (r.area as string) ?? null,
    visibility: r.visibility as string,
    suspendedUntil: (r.suspended_until as string) ?? null,
    bookings: r.bookings as number,
    noShows: r.no_shows as number,
    joined: r.joined as string,
  }));
}

/** Days of 0 lifts a suspension, which is why it is not a boolean. */
export const suspendUser = (playerId: string, days: number, reason?: string) =>
  act('admin_suspend_user', {
    p_player_id: playerId,
    p_days: days,
    p_reason: reason ?? null,
  });

export const resetPassword = (playerId: string, newPassword: string) =>
  act('admin_reset_password', { p_user_id: playerId, p_new_password: newPassword });

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type Report = {
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

export async function reports(state = 'open', limit = 50): Promise<Report[]> {
  return (await call('admin_reports', { p_state: state, p_limit: limit })).map((r) => ({
    reportId: r.report_id as string,
    reporter: r.reporter as string,
    subjectKind: r.subject_kind as string,
    subjectId: r.subject_id as string,
    subjectName: (r.subject_name as string) ?? null,
    reason: r.reason as string,
    body: (r.body as string) ?? null,
    state: r.state as string,
    createdAt: r.created_at as string,
  }));
}

export const resolveReport = (reportId: string, state: string, resolution?: string) =>
  act('admin_resolve_report', {
    p_report_id: reportId,
    p_state: state,
    p_resolution: resolution ?? null,
  });

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export type LedgerRow = {
  venueId: string;
  venueName: string;
  bookings: number;
  grossEgp: number;
  collectedEgp: number;
  outstandingEgp: number;
  forfeitedEgp: number;
};

export async function ledger(days = 30): Promise<LedgerRow[]> {
  return (await call('admin_ledger', { p_days: days })).map((r) => ({
    venueId: r.venue_id as string,
    venueName: r.venue_name as string,
    bookings: r.bookings as number,
    grossEgp: r.gross_egp as number,
    collectedEgp: r.collected_egp as number,
    outstandingEgp: r.outstanding_egp as number,
    forfeitedEgp: r.forfeited_egp as number,
  }));
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export type Setting = {
  key: string;
  value: number;
  description: string | null;
  updatedAt: string | null;
};

export async function settings(): Promise<Setting[]> {
  return (await call('admin_settings')).map((r) => ({
    key: r.key as string,
    value: r.value as number,
    description: (r.description as string) ?? null,
    updatedAt: (r.updated_at as string) ?? null,
  }));
}

export const setSetting = (key: string, value: number) =>
  act('admin_set_setting', { p_key: key, p_value: value });

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export type AuditEntry = {
  at: string;
  actor: string;
  action: string;
  subjectKind: string;
  subjectId: string | null;
  detail: Record<string, unknown>;
};

export async function audit(limit = 100): Promise<AuditEntry[]> {
  return (await call('admin_audit', { p_limit: limit, p_subject_id: null })).map((r) => ({
    at: r.at as string,
    actor: r.actor as string,
    action: r.action as string,
    subjectKind: r.subject_kind as string,
    subjectId: (r.subject_id as string) ?? null,
    detail: (r.detail as Record<string, unknown>) ?? {},
  }));
}
