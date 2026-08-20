import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * The app talks to Postgres through the booking-spine functions, never to the
 * tables directly: §7.2 makes state transitions server-authoritative, and the
 * tables are closed to the API anyway (see the access-control migration).
 *
 * The session that supabase-js holds is what `auth.uid()` resolves to inside
 * those functions, so it is the thing RBAC-002 scoping actually hangs on.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * True when a database is configured. Without one the app runs on the seeded
 * fixtures instead. This is the only place that decision is made.
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
      auth: {
        // AUTH-007: the session survives a restart so a player is not asked to
        // re-verify a phone number every time they open the app.
        storage: Platform.OS === 'web' ? undefined : AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        // No OAuth redirects in this app; the OTP is entered in-app.
        detectSessionInUrl: false,
      },
      global: { headers: { 'x-client-info': 'x-league-app' } },
    });
  }
  return client;
}
