import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isLive, supabase } from '@/lib/supabase';
import { useI18n } from '@/i18n';
import type { STRINGS } from '@/i18n/strings';

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

/**
 * `verification` is where the venue stands with the platform, and it is here
 * rather than fetched per screen because Owner Mode reads this list once a
 * session anyway.
 *
 * It ranks a venue in search and nothing more — `search_venues` returns
 * unverified venues and merely orders verified ones above them. Any copy built
 * on this must not imply a pending venue is hidden, because it is not.
 */
export type VenueVerification = 'pending' | 'verified' | 'rejected' | 'suspended';

export type StaffVenue = {
  venueId: string;
  name: string;
  role: 'staff' | 'manager' | 'owner';
  verification: VenueVerification;
};

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
  /** A year rather than a date: enough for a cup's minimum age, and markedly
   *  less to hold about somebody who may turn out to be a child. */
  birthYear?: number | null;
  gender?: 'man' | 'woman' | null;
  /** A governorate code from `@/data/egypt`. */
  governorate?: string | null;
};

type SessionContextValue = {
  /** Null when signed out, or always in demo mode. */
  session: Session | null;
  signedIn: boolean;
  displayName: string | null;
  /** Venues this person may operate (RBAC-002). Empty for a plain player. */
  venues: StaffVenue[];
  /**
   * The venue Owner Mode is currently operating, and the way to change it.
   *
   * Every owner screen used to read `venues[0]`, with no picker anywhere — so
   * somebody who manages two venues could only ever see, price, staff and take
   * money for the first one alphabetically. The second was invisible from
   * every screen in the product.
   */
  activeVenue: StaffVenue | null;
  setActiveVenue: (venueId: string) => void;
  /**
   * RBAC-003: the platform role, or null. Read for the same reason `venues`
   * is — so the client can stop offering a door that will not open. It never
   * decides who may walk through one; every console function checks for itself.
   */
  platformRole: 'support' | 'moderator' | 'admin' | null;
  /**
   * True when X League has made this person a referee. Read for the same reason
   * as `platformRole` — so the account screen can offer the door — and never to
   * decide anything: every referee function checks for itself.
   */
  isReferee: boolean;
  /** Where this player plays, as a governorate code, or null for all of Egypt. */
  governorate: string | null;
  /** True until the stored session has been read back. */
  restoring: boolean;
  /**
   * True when somebody chose to look around before making an account. The app
   * asks for a sign-in before anything else; this is the one door out of that,
   * and it is deliberate rather than a side effect of a screen that forgot to
   * check. It lasts as long as the app is open, and a sign-out closes it again.
   */
  guest: boolean;
  /** Lets this launch continue without an account. */
  browseAsGuest: () => void;
  /**
   * Reads the name, the venues and the platform role again. Called after
   * something the person just did changes what they are — listing a ground
   * makes them an owner — because the identity otherwise only reloads when the
   * session itself changes, and it would take a sign-out to see it.
   */
  refreshIdentity: () => Promise<void>;
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

/** The resolved string table for the current language. */
type Copy = (typeof STRINGS)['en'];

/**
 * Auth errors reach the player, so they say what happened in words rather than
 * passing a provider's error code through to someone standing at a pitch gate.
 */
function explain(error: { message: string; code?: string }, t: Copy): string {
  // Match the code where supabase-js provides one and the message otherwise:
  // which field carries the reason varies by endpoint and client version, and
  // a player at a pitch gate should never be shown a raw provider string.
  const hay = `${error.code ?? ''} ${error.message}`.toLowerCase();
  const has = (...needles: string[]) => needles.some((n) => hay.includes(n));

  if (has('invalid_credentials', 'invalid login')) return t.authBadCredentials;
  if (has('email_not_confirmed')) return t.authNotUsable;
  // MSG-006: rate limits are real; the player should wait rather than retry.
  if (has('rate limit', 'over_request_rate_limit')) return t.authRateLimited;
  if (has('user_already_exists', 'already registered')) return t.authAlreadyExists;

  // The fallback used to return `error.message`, which is the provider's own
  // English — the exact thing the comment above says never to show, arrived at
  // by falling off the end of the list. It is not actionable by somebody at a
  // gate in either language, so they get a sentence they can act on and the
  // detail goes to the console for whoever can.
  if (__DEV__) console.warn('[auth] unmapped error:', error.code, error.message);
  return t.authUnknown;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  // `I18nProvider` wraps this one in the root layout, so the copy is available
  // here and the auth messages below are the player's own language.
  const { t } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  /**
   * Where this player says they play. Home uses it to put their own
   * governorate first; null is all of Egypt, which is what a guest gets.
   */
  const [governorate, setGovernorate] = useState<string | null>(null);
  const [venues, setVenues] = useState<StaffVenue[]>([]);
  const [platformRole, setPlatformRole] =
    useState<SessionContextValue['platformRole']>(null);
  const [isReferee, setIsReferee] = useState(false);
  const [restoring, setRestoring] = useState(isLive);
  const [guest, setGuest] = useState(false);
  const [identityFailed, setIdentityFailed] = useState(false);
  const [activeVenueId, setActiveVenueId] = useState<string | null>(null);

  /**
   * The staff list is read from the server on every session change rather than
   * cached from a token claim: revoking someone's access has to take effect on
   * their next call, not whenever their JWT happens to expire.
   */
  const loadIdentity = useCallback(async (active: Session | null) => {
    if (!active) {
      setDisplayName(null);
      setGovernorate(null);
      setVenues([]);
      setPlatformRole(null);
      setIsReferee(false);
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
      const [profileRes, venuesRes, roleRes, refRes] = await Promise.all([
        supabase().rpc('my_profile'),
        supabase().rpc('my_venues'),
        supabase().rpc('my_platform_role'),
        supabase().rpc('is_referee'),
      ]);
      const failure = profileRes.error ?? venuesRes.error ?? roleRes.error ?? refRes.error;
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
      setIsReferee(refRes.data === true);
      const me = ((profile ?? []) as { display_name: string; governorate: string | null }[])[0];
      setDisplayName(me?.display_name ?? null);
      setGovernorate(me?.governorate ?? null);
      setVenues(
        (
          (mine ?? []) as {
            venue_id: string;
            name: string;
            role: StaffVenue['role'];
            verification: VenueVerification | null;
          }[]
        ).map((v) => ({
          venueId: v.venue_id,
          name: v.name,
          role: v.role,
          // A venue is pending until the platform says otherwise, which is also
          // what the column defaults to — so an absent value means the same
          // thing here as it does there rather than becoming a fourth state.
          verification: v.verification ?? 'pending',
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
      setIsReferee(false);
    }
  }, []);

  useEffect(() => {
    if (!isLive) return;
    let alive = true;

    /**
     * One listener, with no `getSession()` beside it.
     *
     * `onAuthStateChange` emits `INITIAL_SESSION` carrying the restored session
     * the moment it subscribes — the same answer `getSession()` returns, to the
     * same question. GoTrue then emits `SIGNED_IN` for that same restored
     * session, so a cold load with a stored account ran the identity fetch
     * three times over: nine round trips before a single screen had asked for
     * anything, on every launch, on a connection this product is meant to work
     * on.
     *
     * The guard is keyed on the access token rather than simply firing once,
     * because the reason this reloads at all is that revoking somebody's venue
     * access has to take effect on their next call and not whenever their JWT
     * happens to expire. A refreshed token is a new token and still reloads;
     * the two events announcing one restored session carry one token, so they
     * now load once between them.
     */
    let lastToken: string | null | undefined;

    const { data: sub } = supabase().auth.onAuthStateChange((_event, next) => {
      setSession(next);

      const token = next?.access_token ?? null;
      if (token === lastToken) {
        setRestoring(false);
        return;
      }
      lastToken = token;

      // Held until the identity is in hand, so no screen paints a signed-in
      // frame before it knows whose it is — the gap the fixture used to fill.
      void loadIdentity(next).finally(() => {
        if (alive) setRestoring(false);
      });
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
    const row = (data as { auth_email: string; exists_already: boolean | null }[])[0];
    return row ?? null;
  }, []);

  const signIn = useCallback(
    async (phone: string, password: string) => {
      if (!isLive) return t.authNoDatabase;
      try {
        const found = await addressFor(phone);
        if (!found) return t.authBadNumber;
        // Said before asking GoTrue, because "no account" and "wrong password"
        // are different problems and only one of them is fixed by trying again.
        //
        // `null` is a third answer and not the same as `false`: the lookup is
        // rate limited per caller, and past the allowance it declines to say
        // rather than guessing. Treating that as "no account" would send
        // somebody who has one to create a second; falling through to GoTrue
        // signs them in exactly as before, just without the nicety.
        if (found.exists_already === false) return t.authNoAccountYet;

        const { error } = await supabase().auth.signInWithPassword({
          email: found.auth_email,
          password,
        });
        return error ? explain(error, t) : null;
      } catch (e) {
        return explain(e as { message: string; code?: string }, t);
      }
    },
    [addressFor, t],
  );

  const signUp = useCallback(async (input: SignUpInput) => {
    if (!isLive) return t.authNoDatabase;
    try {
      const { data, error } = await supabase().rpc('sign_up', {
        p_phone: input.phone,
        p_password: input.password,
        p_display_name: input.displayName,
        p_role: input.role,
        p_venue_name: input.venueName ?? null,
        p_venue_area: input.venueArea ?? null,
        p_birth_year: input.birthYear ?? null,
        p_gender: input.gender ?? null,
        p_governorate: input.governorate ?? null,
      });
      if (error) return explain(error, t);

      const row = (data as { ok: boolean; auth_email: string | null; reason: string | null }[])[0];
      // Every rule about what makes an account valid is the server's, so this
      // shows the reason it gave rather than pre-judging any of them.
      if (!row?.ok) return row?.reason ?? 'That did not work.';

      const { error: signInError } = await supabase().auth.signInWithPassword({
        email: row.auth_email!,
        password: input.password,
      });
      return signInError ? explain(signInError, t) : null;
    } catch (e) {
      return explain(e as { message: string; code?: string }, t);
    }
    // `t` is a dependency now that the messages come from it: without it a
    // language switch would leave the previous language's copy in the closure.
  }, [t]);

  const signOut = useCallback(async () => {
    // Signing out puts the door back in front of them, so looking around has
    // to end here too — otherwise somebody who signed out would stay inside
    // the app as a guest and wonder why nothing of theirs was there.
    setGuest(false);
    if (!isLive) return;
    await supabase().auth.signOut();
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      signedIn: !!session,
      displayName,
      venues,
      // Falls back to the first, so a single-venue owner never has to choose,
      // and a stale selection after a role change cannot strand the screen.
      activeVenue: venues.find((v) => v.venueId === activeVenueId) ?? venues[0] ?? null,
      setActiveVenue: setActiveVenueId,
      platformRole,
      isReferee,
      governorate,
      restoring,
      guest,
      browseAsGuest: () => setGuest(true),
      refreshIdentity: () => loadIdentity(session),
      identityFailed,
      signIn,
      signUp,
      signOut,
    }),
    [
      session,
      displayName,
      venues,
      activeVenueId,
      platformRole,
      isReferee,
      governorate,
      restoring,
      guest,
      identityFailed,
      loadIdentity,
      signIn,
      signUp,
      signOut,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside a SessionProvider');
  return ctx;
}
