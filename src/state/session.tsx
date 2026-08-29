import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isLive, supabase } from '@/lib/supabase';

/**
 * Who is signed in, and what they are allowed to operate.
 *
 * AUTH-001 asks for a verified mobile number and a one-time password, and that
 * is still where this is going. Until there is an SMS provider it is a mobile
 * number and a password the person chooses: Supabase refuses phone signups with
 * no SMS configured, so OTP would mean nobody could create an account at all.
 *
 * GoTrue authenticates on an email address, so `sign_up` derives one from the
 * number and hands it back. It is a lookup key, never shown and never sent to,
 * and the server owns the mapping — the client asks for the address rather than
 * building it, so there is one definition of it rather than three.
 *
 * AUTH-005: the same identity carries the player role and any venue roles —
 * there is no second account for Owner Mode, which is what makes the workspace
 * switch in §3.1 possible.
 */

export type StaffVenue = { venueId: string; name: string; role: 'staff' | 'manager' | 'owner' };

/**
 * Joining as a player, or as somebody with a pitch to fill. The venue fields
 * are read only for the second, and the server refuses the second without them.
 */
export type SignUpInput = {
  phone: string;
  password: string;
  displayName: string;
  role: 'player' | 'venue_owner';
  venueName?: string;
  venueArea?: string;
};

type SessionContextValue = {
  /** Null when signed out, or always in demo mode. */
  session: Session | null;
  signedIn: boolean;
  displayName: string | null;
  /** Venues this person may operate (RBAC-002). Empty for a plain player. */
  venues: StaffVenue[];
  /**
   * RBAC-003: the platform role, or null. Read for the same reason `venues`
   * is — so the client can stop offering a door that will not open. It never
   * decides who may walk through one; every console function checks for itself.
   */
  platformRole: 'support' | 'moderator' | 'admin' | null;
  /** True until the stored session has been read back. */
  restoring: boolean;
  /**
   * True when this person's profile, venues or platform role could not be
   * read. It matters beyond the greeting: an empty `venues` and a null
   * `platformRole` silently remove Owner Mode and the admin console from the
   * account screen, so a failure here looks exactly like a demotion.
   */
  identityFailed: boolean;

  /** Signs in with a number and password. Resolves to an error, or null. */
  signIn: (phone: string, password: string) => Promise<string | null>;
  /**
   * Creates the account and signs straight into it, because a person who has
   * just chosen a password should not then be asked for it.
   */
  signUp: (input: SignUpInput) => Promise<string | null>;
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

  if (has('invalid_credentials', 'invalid login'))
    return 'That number and password do not match. Check them and try again.';
  if (has('email_not_confirmed'))
    return 'That account is not usable yet. Ask an administrator to check it.';
  // MSG-006: rate limits are real; the player should wait rather than retry.
  if (has('rate limit', 'over_request_rate_limit'))
    return 'Too many attempts. Wait a minute before trying again.';
  if (has('user_already_exists', 'already registered'))
    return 'That number already has an account. Sign in instead.';
  return error.message;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [venues, setVenues] = useState<StaffVenue[]>([]);
  const [platformRole, setPlatformRole] =
    useState<SessionContextValue['platformRole']>(null);
  const [restoring, setRestoring] = useState(isLive);
  const [identityFailed, setIdentityFailed] = useState(false);

  /**
   * The staff list is read from the server on every session change rather than
   * cached from a token claim: revoking someone's access has to take effect on
   * their next call, not whenever their JWT happens to expire.
   */
  const loadIdentity = useCallback(async (active: Session | null) => {
    if (!active) {
      setDisplayName(null);
      setVenues([]);
      setPlatformRole(null);
      setIdentityFailed(false);
      return;
    }
    try {
      // Through a function, like everything else. Reading player_profile
      // directly answered 403 on every sign-in — RLS is on and no table has
      // grants — and the catch below swallowed it, so `displayName` stayed
      // null and the screens fell back to the design fixture's name.
      //
      // The errors are checked rather than caught. `supabase().rpc()` resolves
      // with `{ data: null, error }` — it does not reject — so the try/catch
      // around this could never fire for an RPC failure in the first place.
      // That is the mechanism that hid the 403: not that the failure was
      // caught, but that nothing ever looked at it.
      const [profileRes, venuesRes, roleRes] = await Promise.all([
        supabase().rpc('my_profile'),
        supabase().rpc('my_venues'),
        supabase().rpc('my_platform_role'),
      ]);
      const failure = profileRes.error ?? venuesRes.error ?? roleRes.error;
      if (failure) {
        if (__DEV__) console.warn('[session] could not load identity:', failure.message);
        setIdentityFailed(true);
      } else {
        setIdentityFailed(false);
      }
      const { data: profile } = profileRes;
      const { data: mine } = venuesRes;
      const { data: role } = roleRes;
      setPlatformRole((role as SessionContextValue['platformRole']) ?? null);
      setDisplayName(
        ((profile ?? []) as { display_name: string }[])[0]?.display_name ?? null,
      );
      setVenues(
        ((mine ?? []) as { venue_id: string; name: string; role: StaffVenue['role'] }[]).map((v) => ({
          venueId: v.venue_id,
          name: v.name,
          role: v.role,
        })),
      );
    } catch {
      // A profile we cannot read is not a reason to drop the session; the
      // booking spine checks authority on the server for every call anyway.
      // It is a reason to say so, though — a swallowed failure here is how a
      // 403 turned into the app confidently greeting people by the wrong name.
      if (__DEV__) console.warn('[session] could not load identity');
      setIdentityFailed(true);
      setVenues([]);
      setPlatformRole(null);
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

  /**
   * The address GoTrue knows this number by. Asked for rather than derived,
   * because the normalisation rules — a leading 00, a local trunk 0 — live in
   * one place on the server and a second copy here would drift out of step and
   * quietly lock people out of their own accounts.
   */
  const addressFor = useCallback(async (phone: string) => {
    const { data, error } = await supabase().rpc('auth_email_for_sign_in', { p_phone: phone });
    if (error) throw error;
    const row = (data as { auth_email: string; exists_already: boolean }[])[0];
    return row ?? null;
  }, []);

  const signIn = useCallback(
    async (phone: string, password: string) => {
      if (!isLive) return 'No database configured.';
      try {
        const found = await addressFor(phone);
        if (!found) return 'That does not look like a valid mobile number.';
        // Said before asking GoTrue, because "no account" and "wrong password"
        // are different problems and only one of them is fixed by trying again.
        if (!found.exists_already)
          return 'No account for that number yet. Create one below.';

        const { error } = await supabase().auth.signInWithPassword({
          email: found.auth_email,
          password,
        });
        return error ? explain(error) : null;
      } catch (e) {
        return explain(e as { message: string; code?: string });
      }
    },
    [addressFor],
  );

  const signUp = useCallback(async (input: SignUpInput) => {
    if (!isLive) return 'No database configured.';
    try {
      const { data, error } = await supabase().rpc('sign_up', {
        p_phone: input.phone,
        p_password: input.password,
        p_display_name: input.displayName,
        p_role: input.role,
        p_venue_name: input.venueName ?? null,
        p_venue_area: input.venueArea ?? null,
      });
      if (error) return explain(error);

      const row = (data as { ok: boolean; auth_email: string | null; reason: string | null }[])[0];
      // Every rule about what makes an account valid is the server's, so this
      // shows the reason it gave rather than pre-judging any of them.
      if (!row?.ok) return row?.reason ?? 'That did not work.';

      const { error: signInError } = await supabase().auth.signInWithPassword({
        email: row.auth_email!,
        password: input.password,
      });
      return signInError ? explain(signInError) : null;
    } catch (e) {
      return explain(e as { message: string; code?: string });
    }
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
      platformRole,
      restoring,
      identityFailed,
      signIn,
      signUp,
      signOut,
    }),
    [session, displayName, venues, platformRole, restoring, identityFailed, signIn, signUp, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside a SessionProvider');
  return ctx;
}
