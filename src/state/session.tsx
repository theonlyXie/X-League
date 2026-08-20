import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { checkPlatformAdmin } from '@/data/adminApi';
import { isLive, supabase } from '@/lib/supabase';

/**
 * Who is signed in, and what they are allowed to operate.
 *
 * AUTH-001: registration and sign-in are a verified mobile number plus a
 * one-time password. AUTH-005: the same identity carries the player role and
 * any venue roles — there is no second account for Owner Mode, which is what
 * makes the workspace switch in §3.1 possible.
 */

export type StaffVenue = { venueId: string; name: string; role: 'staff' | 'manager' | 'owner' };

type SessionContextValue = {
  /** Null when signed out, or always in demo mode. */
  session: Session | null;
  signedIn: boolean;
  displayName: string | null;
  /** Venues this person may operate (RBAC-002). Empty for a plain player. */
  venues: StaffVenue[];
  /** Platform operator — may open /admin when live. */
  isAdmin: boolean;
  /** True until the stored session has been read back. */
  restoring: boolean;

  /** Sends the one-time password. Resolves to an error message, or null. */
  requestOtp: (phone: string) => Promise<string | null>;
  /** Verifies it. Resolves to an error message, or null on success. */
  verifyOtp: (phone: string, token: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Auth errors reach the player, so they say what happened in words rather than
 * passing a provider's error code through to someone standing at a pitch gate.
 */
function explain(error: { message: string; code?: string }): string {
  // Match the code where supabase-js provides one and the message otherwise:
  // which field carries the reason varies by endpoint and client version, and
  // a player at a pitch gate should never be shown a raw provider string.
  const hay = `${error.code ?? ''} ${error.message}`.toLowerCase();
  const has = (...needles: string[]) => needles.some((n) => hay.includes(n));

  if (has('phone_provider_disabled', 'unsupported phone provider'))
    return 'SMS sign-in is not switched on for this deployment yet. An SMS provider has to be configured before codes can be sent.';
  if (has('otp_expired', 'expired')) return 'That code has expired. Ask for a new one.';
  if (has('invalid_credentials', 'token has expired or is invalid', 'invalid token'))
    return "That code didn't match. Check it and try again.";
  // MSG-006: rate limits are real; the player should wait rather than retry.
  if (has('rate limit', 'over_sms_send_rate_limit', 'over_request_rate_limit'))
    return 'Too many codes requested. Wait a minute before trying again.';
  if (has('validation_failed', 'invalid phone'))
    return 'That does not look like a valid mobile number. Include the country code.';
  return error.message;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [venues, setVenues] = useState<StaffVenue[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [restoring, setRestoring] = useState(isLive);

  /**
   * The staff list is read from the server on every session change rather than
   * cached from a token claim: revoking someone's access has to take effect on
   * their next call, not whenever their JWT happens to expire.
   */
  const loadIdentity = useCallback(async (active: Session | null) => {
    if (!active) {
      setDisplayName(null);
      setVenues([]);
      setIsAdmin(false);
      return;
    }
    try {
      const [{ data: profile }, { data: mine }, admin] = await Promise.all([
        supabase().from('player_profile').select('display_name').eq('id', active.user.id).maybeSingle(),
        supabase().rpc('my_venues'),
        checkPlatformAdmin(),
      ]);
      setDisplayName((profile as { display_name: string } | null)?.display_name ?? null);
      setVenues(
        ((mine ?? []) as { venue_id: string; name: string; role: StaffVenue['role'] }[]).map((v) => ({
          venueId: v.venue_id,
          name: v.name,
          role: v.role,
        })),
      );
      setIsAdmin(admin);
    } catch {
      // A profile we cannot read is not a reason to drop the session; the
      // booking spine checks authority on the server for every call anyway.
      setVenues([]);
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    if (!isLive) return;
    let alive = true;

    supabase()
      .auth.getSession()
      .then(async ({ data }) => {
        if (!alive) return;
        setSession(data.session);
        await loadIdentity(data.session);
        setRestoring(false);
      })
      .catch(() => alive && setRestoring(false));

    const { data: sub } = supabase().auth.onAuthStateChange((_event, next) => {
      setSession(next);
      void loadIdentity(next);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [loadIdentity]);

  const requestOtp = useCallback(async (phone: string) => {
    if (!isLive) return 'No database configured.';
    const { error } = await supabase().auth.signInWithOtp({ phone });
    return error ? explain(error) : null;
  }, []);

  const verifyOtp = useCallback(async (phone: string, token: string) => {
    if (!isLive) return 'No database configured.';
    const { error } = await supabase().auth.verifyOtp({ phone, token, type: 'sms' });
    return error ? explain(error) : null;
  }, []);

  const signOut = useCallback(async () => {
    if (!isLive) return;
    await supabase().auth.signOut();
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      signedIn: !!session,
      displayName,
      venues,
      isAdmin,
      restoring,
      requestOtp,
      verifyOtp,
      signOut,
    }),
    [session, displayName, venues, isAdmin, restoring, requestOtp, verifyOtp, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside a SessionProvider');
  return ctx;
}
