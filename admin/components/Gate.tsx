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
          You are signed in, but this number has no platform role. Cups are run by X League staff.
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
  const { requestOtp, verifyOtp } = useSession();
  const [phone, setPhone] = useState('');
  const [token, setToken] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    const err = await requestOtp(phone.trim());
    setBusy(false);
    if (err) setError(err);
    else {
      setError(null);
      setSent(true);
    }
  };

  const verify = async () => {
    setBusy(true);
    const err = await verifyOtp(phone.trim(), token.trim());
    setBusy(false);
    setError(err);
  };

  return (
    <Centre>
      <div className="brand" style={{ marginBottom: 20 }}>
        <span className="brand-mark">X</span>
        <span>X League — Admin</span>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      {/* The same phone-OTP identity the app uses (AUTH-001). One account, one
          person, whichever surface they open. */}
      {!sent ? (
        <>
          <label htmlFor="phone">Phone number</label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+20 100 000 0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && phone.trim() && void send()}
          />
          <div style={{ marginTop: 16 }}>
            <button
              className="primary"
              style={{ width: '100%' }}
              disabled={busy || phone.trim().length < 6}
              onClick={() => void send()}
            >
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </div>
        </>
      ) : (
        <>
          <label htmlFor="code">Code sent to {phone}</label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && token.trim() && void verify()}
          />
          <div style={{ marginTop: 16 }} className="row">
            <button
              className="primary"
              style={{ flex: 1 }}
              disabled={busy || token.trim().length < 4}
              onClick={() => void verify()}
            >
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button onClick={() => setSent(false)} disabled={busy}>
              Back
            </button>
          </div>
        </>
      )}
    </Centre>
  );
}
