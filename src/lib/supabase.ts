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
      global: { fetch: withTimeout, headers: { 'x-client-info': 'x-league-app' } },
      auth: {
        // AUTH-007: the session survives a restart so a player is not asked to
        // re-verify a phone number every time they open the app.
        storage: Platform.OS === 'web' ? undefined : AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        // No OAuth redirects in this app; the OTP is entered in-app.
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/**
 * A request that cannot hang forever.
 *
 * Every screen here is a spinner until its request answers, and a mobile
 * connection that drops mid-flight does not answer — it simply never does.
 * The screen then sits there, the button that started it stays disabled, and
 * the only way out is to kill the app and open it again. That is what "the app
 * freezes" means from the outside, and no amount of error handling helps when
 * nothing ever throws.
 *
 * Twenty seconds is well past the slowest honest answer this database gives and
 * well short of a person's patience. What comes back is an ordinary failure,
 * which every caller here already knows how to show.
 */
const TIMEOUT_MS = 20000;

async function withTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    return await fetch(input as RequestInfo, { ...init, signal: control.signal });
  } finally {
    clearTimeout(timer);
  }
}
