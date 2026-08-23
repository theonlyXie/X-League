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

export type PlatformRole = 'support' | 'admin' | 'owner';

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
  requestOtp: (phone: string) => Promise<string | null>;
  verifyOtp: (phone: string, token: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<SessionValue | null>(null);

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

  const requestOtp = useCallback(async (phone: string) => {
    const { error } = await supabase().auth.signInWithOtp({ phone });
    return error?.message ?? null;
  }, []);

  const verifyOtp = useCallback(async (phone: string, token: string) => {
    const { error } = await supabase().auth.verifyOtp({ phone, token, type: 'sms' });
    return error?.message ?? null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase().auth.signOut();
    setRole(null);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ session, restoring, role, roleLoading, requestOtp, verifyOtp, signOut }),
    [session, restoring, role, roleLoading, requestOtp, verifyOtp, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}
