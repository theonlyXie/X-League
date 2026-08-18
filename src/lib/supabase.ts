import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * The app talks to Postgres through the booking-spine functions, never to the
 * tables directly: §7.2 makes state transitions server-authoritative, and a
 * client that could write `booking` rows itself would be able to sidestep the
 * one constraint the whole product rests on.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * True when a database is configured. Without one the app runs on the seeded
 * fixtures instead — see `src/data/source.ts`. This is the only place that
 * decision is made.
 */
export const isLive = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!isLive) {
    throw new Error(
      'No database configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, or run in demo mode.',
    );
  }
  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: { persistSession: false },
      // Times come back as ISO strings and are handed straight back to the
      // server on the next call; the client never assembles a timestamp of its
      // own, because Egypt observes DST and a hardcoded offset addresses the
      // wrong hour for half the year.
      global: { headers: { 'x-client-info': 'x-league-app' } },
    });
  }
  return client;
}
