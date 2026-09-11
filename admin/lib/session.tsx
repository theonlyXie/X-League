'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { isConfigured, supabase } from './supabase';

/**
 * The three roles the database actually has.
 *
 * This used to read `'support' | 'admin' | 'owner'`. There is no `owner`
 * platform role — ownership is a venue relationship, not a platform one — and
 * `moderator` was missing, which is the role that runs the verification queue
 * and the report queue. So a moderator signed in, was recognised as staff, and
 * then found every action in the console hidden from them: `canAct` compared
 * their role against two words, neither of which they could ever hold.
 */
export type PlatformRole = 'support' | 'moderator' | 'admin';

type SessionValue = {
  /** Null until the stored session has been read; then a session or none. */
  session: Session | null;
  restoring: boolean;
  /**
   * The caller's platform role, from `my_platform_role`. Null means signed in
   * but not staff — which is a different screen from signed out, and the one
   * an ordinary player would land on if they found this URL.
   */
  role: PlatformRole | null;
  roleLoading: boolean;
  /**
   * Staff sign in with a username rather than a phone number — they are not
   * players, and the account is not tied to a handset. The username maps to
   * the same kind of lookup address every account has.
   */
  signIn: (username: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;

  /**
   * A new password, for somebody holding the recovery code. Issues a fresh one.
   *
   * This is the only way into a console account other than knowing its
   * password, and that is the point. There used to be a second — setting the
   * first password on an account that had never had one, with nothing but the
   * username — and it meant every staff account sat claimable by whoever
   * guessed the username first. An account is now created with a password
   * already on it and a code handed over with it, so there is no unclaimed
   * account to race for. See 20260911091000.
   */
  resetPassword: (username: string, code: string, password: string) => Promise<Claimed>;
};

/** Either it worked and there is a code to write down, or it did not. */
export type Claimed = { ok: boolean; reason: string | null; recoveryCode: string | null };

const Ctx = createContext<SessionValue | null>(null);

/**
 * Staff usernames are addresses under the same domain player accounts use.
 *
 * GoTrue needs an email to authenticate, and the whole product gives it one
 * that is a lookup key rather than a mailbox: a player's is derived from their
 * number, a staff member's from their username. Someone who types the full
 * address gets it through unchanged, so both work.
 */
export function staffAddress(username: string): string {
  const u = username.trim().toLowerCase();
  return u.includes('@') ? u : `${u}@xleague.app`;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [role, setRole] = useState<PlatformRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);

  useEffect(() => {
    if (!isConfigured) {
      setRestoring(false);
      return;
    }
    const sb = supabase();
    void sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setRestoring(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  // The role is the server's answer, asked once per session rather than
  // inferred from anything the browser holds. A dashboard that decided its own
  // permissions would be deciding them in the one place an attacker controls.
  useEffect(() => {
    if (!session) {
      setRole(null);
      return;
    }
    let cancelled = false;
    setRoleLoading(true);
    void supabase()
      .rpc('my_platform_role')
      .then(({ data }) => {
        if (!cancelled) setRole((data as PlatformRole | null) ?? null);
      })
      .then(undefined, () => {
        if (!cancelled) setRole(null);
      })
      .then(() => {
        if (!cancelled) setRoleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const signIn = useCallback(async (username: string, password: string) => {
    const { error } = await supabase().auth.signInWithPassword({
      email: staffAddress(username),
      password,
    });
    if (!error) return null;
    // A provider code at a sign-in box helps nobody.
    return /invalid.login|invalid_credentials/i.test(`${error.code ?? ''} ${error.message}`)
      ? 'That username and password do not match.'
      : error.message;
  }, []);

  const claim = async (fn: string, args: Record<string, string>): Promise<Claimed> => {
    const { data, error } = await supabase().rpc(fn, args);
    // `rpc` resolves with an error rather than rejecting, so this is checked
    // rather than caught — the same mechanism that once hid a 403 in the app.
    if (error) return { ok: false, reason: error.message, recoveryCode: null };
    const row = (data as { ok: boolean; reason: string | null; recovery_code: string | null }[])[0];
    return { ok: !!row?.ok, reason: row?.reason ?? null, recoveryCode: row?.recovery_code ?? null };
  };

  const resetPassword = useCallback(
    (username: string, code: string, password: string) =>
      claim('staff_reset_password', { p_username: username, p_code: code, p_password: password }),
    [],
  );

  const signOut = useCallback(async () => {
    await supabase().auth.signOut();
    setRole(null);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ session, restoring, role, roleLoading, signIn, signOut, resetPassword }),
    [session, restoring, role, roleLoading, signIn, signOut, resetPassword],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}
