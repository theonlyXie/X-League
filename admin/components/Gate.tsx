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

/**
 * What the signed-in person may do, for pages that hide an action.
 *
 * `support` is read-only; a moderator moderates, which is most of this console.
 * The server checks for itself either way — this only decides whether to offer
 * a control that would refuse.
 */
export function canAct(role: PlatformRole | null): boolean {
  return role === 'admin' || role === 'moderator';
}

function Centre({ children }: { children: ReactNode }) {
  return (
    <div className="centre">
      <div className="card">{children}</div>
    </div>
  );
}

/**
 * The word that means "I have forgotten it".
 *
 * Typed into the password box rather than sitting behind a link, because that
 * is how the person who runs this console asked for it. It is safe to key on:
 * a real password must be at least eight characters, so no account can ever
 * have this as its own.
 *
 * It opens the recovery form. It does not reset anything by itself — the reset
 * needs the recovery code, and a reset that any visitor could trigger from the
 * sign-in screen of a public URL would be a way in rather than a way back.
 */
const FORGOT_WORD = 'su';

/**
 * One way back in, not two.
 *
 * There used to be a `claim` step as well: an account that had never had a
 * password could be given one by anybody who knew the username, and the screen
 * asked the server which usernames those were so it could offer the option. Both
 * halves are gone — an account is created with a password already set and a
 * recovery code handed over with it, so the first sign-in and the hundredth use
 * the same door.
 */
type Step = 'signIn' | 'recover' | 'done';

function SignIn() {
  const { signIn, resetPassword } = useSession();
  const [step, setStep] = useState<Step>('signIn');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [fresh, setFresh] = useState('');
  const [issued, setIssued] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = username.trim();

  const submit = async () => {
    setBusy(true);
    setError(null);

    if (password.trim().toLowerCase() === FORGOT_WORD) {
      setStep('recover');
      setPassword('');
      setBusy(false);
      return;
    }

    setError(await signIn(name, password));
    setBusy(false);
  };

  const finish = async (result: Awaited<ReturnType<typeof resetPassword>>) => {
    setBusy(false);
    if (!result.ok) {
      setError(result.reason ?? 'That did not work.');
      return;
    }
    setIssued(result.recoveryCode);
    setStep('done');
  };

  // The code is shown once and never again — it is stored hashed, so there is
  // nothing to show a second time even to somebody with the database open.
  if (step === 'done') {
    return (
      <Centre>
        <h1>Write this down</h1>
        <p className="muted">
          Your recovery code. It is the only way back into this console if the password is
          forgotten, and it is not stored anywhere it can be read again.
        </p>
        <div className="mono" style={{ fontSize: 22, letterSpacing: 2, margin: '18px 0' }}>
          {issued}
        </div>
        <p className="faint">
          Using it issues a new one, so a code that has been read aloud or pasted somewhere stops
          working the moment it is used.
        </p>
        <div style={{ marginTop: 18 }}>
          <button
            className="primary"
            style={{ width: '100%' }}
            onClick={() => {
              setIssued(null);
              setCode('');
              setFresh('');
              setPassword('');
              setStep('signIn');
            }}
          >
            Sign in
          </button>
        </div>
      </Centre>
    );
  }

  if (step === 'recover') {
    const ready = name.length >= 2 && fresh.length >= 8 && code.trim().length >= 8;
    return (
      <Centre>
        <div className="brand" style={{ marginBottom: 20 }}>
          <span className="brand-mark">X</span>
          <span>X League — Admin</span>
        </div>

        <h1 style={{ marginTop: 0 }}>Set your password</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Your recovery code is the one you were given when the account was made, or the last one a
          reset issued.
        </p>
        {error ? <div className="notice error">{error}</div> : null}

        <label htmlFor="ruser">Username</label>
        <input id="ruser" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />

        <div style={{ marginTop: 14 }}>
          <label htmlFor="code">Recovery code</label>
          <input
            id="code"
            className="mono"
            autoCapitalize="characters"
            placeholder="XXXX-XXXX-XXXX-XXXX"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <label htmlFor="fresh">New password</label>
          <input
            id="fresh"
            type="password"
            autoComplete="new-password"
            value={fresh}
            onChange={(e) => setFresh(e.target.value)}
          />
        </div>

        <div style={{ marginTop: 18 }}>
          <button
            className="primary"
            style={{ width: '100%' }}
            disabled={busy || !ready}
            onClick={() => {
              setBusy(true);
              setError(null);
              void resetPassword(name, code.trim().toUpperCase(), fresh).then(finish);
            }}
          >
            {busy ? 'Working…' : 'Set password'}
          </button>
        </div>

        <p className="faint" style={{ marginTop: 16, marginBottom: 0 }}>
          <button
            style={{ padding: 0, background: 'none', border: 0 }}
            onClick={() => {
              setStep('signIn');
              setError(null);
            }}
          >
            Back to sign in
          </button>
        </p>
      </Centre>
    );
  }

  const ready = name.length >= 2 && (password.length >= 8 || password.trim().toLowerCase() === FORGOT_WORD);

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
        placeholder="Xie"
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
        Staff accounts only. Players use the app. First time here, or forgotten it? Type <b>Su</b> as
        the password and use your recovery code.
      </p>
    </Centre>
  );
}
