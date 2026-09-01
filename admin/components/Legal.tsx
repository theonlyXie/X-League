import type { ReactNode } from 'react';
import { CONTACT_EMAIL, CONTACT_IS_PLACEHOLDER } from '@/lib/contact';

/**
 * The public documents.
 *
 * These are the only pages on this deployment that are not the console: no
 * sign-in, no session, no navigation into the operations tool. Both stores ask
 * for a URL that anybody can open without installing anything, and this is it.
 */
export function Legal({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="legal">
      <header>
        <p className="eyebrow">X League</p>
        <h1>{title}</h1>
        <p className="faint">Last updated {updated}</p>
      </header>

      {CONTACT_IS_PLACEHOLDER ? (
        <div className="notice error">
          This document is not finished: the contact address is still a
          placeholder. Set <code className="mono">CONTACT_EMAIL</code> in{' '}
          <code className="mono">admin/lib/contact.ts</code> before submitting the app to
          either store — both check that the address reaches somebody.
        </div>
      ) : null}

      {children}

      <footer>
        <p className="faint">
          Questions, corrections, or a request about your data: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        <p className="faint">
          <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> ·{' '}
          <a href="/delete-account">Delete your account</a>
        </p>
      </footer>
    </main>
  );
}
