import { supabase } from '@/lib/supabase';
import type { KpiTone, LedgerKind, LedgerRow } from '@/data/admin';

export type AdminKpi = { label: string; value: string; sub: string; tone: KpiTone };
export type AdminAttention = { title: string; detail: string; severe: boolean };
export type AdminAudit = { at: string; event: string; actor: string; bookingCode?: string };
export type AdminVenueRow = {
  name: string;
  area: string;
  pitches: number;
  occupancy: string;
  drift: string;
  status: string;
};
export type PendingSubmission = {
  id: string;
  name: string;
  area: string;
  ownerName: string;
  submittedAt: string;
};

export type AdminOverview = {
  kpis: AdminKpi[];
  attention: AdminAttention[];
  pendingVenues: number;
  bookingsToday: number;
  asOf: string;
};

export async function checkPlatformAdmin(): Promise<boolean> {
  const { data, error } = await supabase().rpc('is_platform_admin');
  if (error) return false;
  return Boolean(data);
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  const { data, error } = await supabase().rpc('admin_overview');
  if (error) throw error;
  const row = data as {
    kpis: AdminKpi[];
    attention: AdminAttention[];
    pending_venues: number;
    bookings_today: number;
    as_of: string;
  };
  return {
    kpis: row.kpis ?? [],
    attention: row.attention ?? [],
    pendingVenues: row.pending_venues ?? 0,
    bookingsToday: row.bookings_today ?? 0,
    asOf: row.as_of ?? '',
  };
}

export async function fetchAdminLedger(filter: 'all' | 'app' | 'failed' = 'all'): Promise<LedgerRow[]> {
  const { data, error } = await supabase().rpc('admin_ledger', {
    p_limit: 20,
    p_filter: filter,
  });
  if (error) throw error;
  return (data as Record<string, string>[]).map((r) => ({
    code: r.code,
    venue: r.venue,
    captain: r.captain,
    source: r.source === 'App' ? 'App' : r.source,
    deposit: r.deposit,
    status: r.status,
    kind: r.kind as LedgerKind,
  }));
}

export async function fetchAdminAudit(): Promise<AdminAudit[]> {
  const { data, error } = await supabase().rpc('admin_audit_trail', { p_limit: 12 });
  if (error) throw error;
  return (data as Record<string, string>[]).map((r) => ({
    at: r.at,
    event: r.event,
    actor: r.actor,
    bookingCode: r.booking_code,
  }));
}

export async function fetchAdminVenues(): Promise<AdminVenueRow[]> {
  const { data, error } = await supabase().rpc('admin_venues');
  if (error) throw error;
  return (data as Record<string, unknown>[]).map((r) => ({
    name: r.name as string,
    area: r.area as string,
    pitches: Number(r.pitches),
    occupancy: r.occupancy as string,
    drift: r.drift as string,
    status: r.status as string,
  }));
}

export async function fetchPendingSubmissions(): Promise<PendingSubmission[]> {
  const { data, error } = await supabase().rpc('admin_pending_submissions');
  if (error) throw error;
  return (data as Record<string, string>[]).map((r) => ({
    id: r.id,
    name: r.name,
    area: r.area,
    ownerName: r.owner_name,
    submittedAt: r.submitted_at,
  }));
}

export async function approveVenueSubmission(id: string): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('admin_approve_venue', { p_submission_id: id });
  if (error) throw error;
  const row = (data as { ok: boolean; reason: string | null }[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

export async function rejectVenueSubmission(id: string, reason?: string): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('admin_reject_venue', {
    p_submission_id: id,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  const row = (data as { ok: boolean; reason: string | null }[])[0];
  return row.ok ? { ok: true } : { ok: false, reason: row.reason ?? undefined };
}

export async function submitVenueLive(name: string, area: string) {
  const { data, error } = await supabase().rpc('submit_venue', { p_name: name, p_area: area });
  if (error) throw error;
  return (data as Record<string, string>[])[0];
}

export async function myVenueSubmissionLive() {
  const { data, error } = await supabase().rpc('my_venue_submission');
  if (error) throw error;
  const rows = data as Record<string, string>[];
  return rows.length ? rows[0] : null;
}
