import type { Metadata } from 'next';
import { Legal } from '@/components/Legal';
import { CONTACT_EMAIL } from '@/lib/contact';

export const metadata: Metadata = {
  title: 'X League — Delete your account',
  description: 'How to delete an X League account and what goes with it.',
  robots: { index: true, follow: true },
};

/**
 * Play requires a route to account deletion that works without installing the
 * app, so this page is linked from the store listing. It is deliberately plain:
 * somebody reading it has already decided.
 */
export default function DeleteAccount() {
  return (
    <Legal title="Delete your account" updated="1 September 2026">
      <p className="lede">
        You can delete your X League account yourself, in the app, in about ten seconds. Nothing is
        kept back and nothing has to be requested.
      </p>

      <h2>In the app</h2>
      <ol>
        <li>Open X League and sign in.</li>
        <li>
          Go to <b>Me</b>.
        </li>
        <li>
          Scroll to the bottom and choose <b>Delete my account</b>.
        </li>
        <li>Confirm. That is it — you are signed out and the account is gone.</li>
      </ol>

      <h2>Without the app</h2>
      <p>
        Write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from any address, telling us
        the mobile number on the account. We will delete it within 30 days and confirm when it is
        done. We may ask you to confirm the number by SMS first, so that nobody can delete somebody
        else&rsquo;s account.
      </p>

      <h2>What is deleted</h2>
      <ul>
        <li>Your account and your sign-in.</li>
        <li>Your name, your mobile number, your photograph and your area.</li>
        <li>Your player card, your self-assessment, your points and your ratings.</li>
        <li>Your club and team memberships, and your invitations.</li>
      </ul>

      <h2>What survives, without your name on it</h2>
      <p>
        A few records belong to other people as well as to you, and deleting them would rewrite
        somebody else&rsquo;s history:
      </p>
      <ul>
        <li>
          A match that was played, and its score. It stays; you become a former player rather than a
          name.
        </li>
        <li>A booking a venue took, for its own accounts.</li>
        <li>
          Messages in a room other people are still reading. They stay, without a sender.
        </li>
      </ul>

      <h2>One thing to do first</h2>
      <p>
        If you captain a club that has other members, or you are the only owner of a venue, hand it
        over before you go — otherwise a squad or a ground loses the only person who can run it. The
        app will tell you which, by name, and will not delete the account until it is done.
      </p>
    </Legal>
  );
}
