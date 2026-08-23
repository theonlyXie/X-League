'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * One browser client, created lazily.
 *
 * The dashboard reaches the database exactly the way the app does — the
 * publishable key, PostgREST, and the same SECURITY DEFINER functions that
 * check `auth.uid()` themselves. There is no server-side route handler holding
 * a stronger key, because there is no stronger key: every permission the
 * dashboard has, it has because the signed-in person has it.
 */
let client: SupabaseClient | null = null;

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** False when the deployment has no database configured, so pages can say so. */
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export function supabase(): SupabaseClient {
  if (!isConfigured) {
    throw new Error(
      'No database configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return client;
}

/** Unwrap a `returns table (ok, …, reason)` RPC into something to render. */
export function outcome<T extends Record<string, unknown>>(
  data: unknown,
): { ok: true; row: T } | { ok: false; reason: string } {
  const row = (data as T[] | null)?.[0];
  if (!row) return { ok: false, reason: 'The server returned nothing.' };
  if (row.ok === true) return { ok: true, row };
  return { ok: false, reason: (row.reason as string) ?? 'That was refused.' };
}
