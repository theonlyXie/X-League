'use client';

import { useState, type ReactNode } from 'react';
import { isConfigured } from '@/lib/supabase';
import { useSession, type PlatformRole } from '@/lib/session';

/**
 * Nothing renders until the server has said who this is.
 *
 * The gate is a courtesy, not a security boundary — every function behind it
 * checks `auth.uid()` itself, and a person who bypassed this screen would get
 * "You do not manage that tournament." from the database rather than a cup.
 * What it buys is an honest empty state: a player who finds this URL is told
 * plainly that this is not for them, instead of meeting a wall of refusals.
 */
export function Gate({ children }: { children: ReactNode }) {
  const { session, restoring, role, roleLoading, signOut } = useSession();

  if (!isConfigured) {
    return (
      <Centre>
        <h1>Not configured</h1>
        <p className="muted">
          This deployment has no database. Set <code className="mono">NEXT_PUBLIC_SUPABASE_URL</code>{' '}
          and <code className="mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in the Vercel project, then
          redeploy.
        </p>
      </Centre>
    );
  }

  if (restoring) return <Centre>{null}</Centre>;
  if (!session) return <SignIn />;
  if (roleLoading) return <Centre>{null}</Centre>;

  if (!role) {
    return (
      <Centre>
        <h1>Not an admin account</h1>
        <p className="muted">
          You are signed in, but this account has no platform role. Cups are run by X League staff.
        </p>
        <div style={{ marginTop: 18 }}>
          <button onClick={() => void signOut()}>Sign out</button>
        </div>
      </Centre>
    );
  }

  return <>{children}</>;
}

/** What the signed-in person may do, for pages that hide an action. */
export function canAct(role: PlatformRole | null): boolean {
  return role === 'admin' || role === 'owner';
}

function Centre({ children }: { children: ReactNode }) {
  return (
    <div className="centre">
      <div className="card">{children}</div>
    </div>
  );
}

function SignIn() {
  const { signIn } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(await signIn(username, password));
    setBusy(false);
  };

  const ready = username.trim().length >= 2 && password.length >= 8;

  return (
    <Centre>
      <div className="brand" style={{ marginBottom: 20 }}>
        <span className="brand-mark">X</span>
        <span>X League — Admin</span>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      <label htmlFor="username">Username</label>
      <input
        id="username"
        autoComplete="username"
        autoCapitalize="none"
        autoFocus
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && ready && void submit()}
      />

      <div style={{ marginTop: 14 }}>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ready && void submit()}
        />
      </div>

      <div style={{ marginTop: 18 }}>
        <button
          className="primary"
          style={{ width: '100%' }}
          disabled={busy || !ready}
          onClick={() => void submit()}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>

      <p className="faint" style={{ marginTop: 16, marginBottom: 0 }}>
        Staff accounts only. Players use the app.
      </p>
    </Centre>
  );
}
