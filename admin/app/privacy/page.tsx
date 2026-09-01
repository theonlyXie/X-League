import type { Metadata } from 'next';
import { Legal } from '@/components/Legal';

export const metadata: Metadata = {
  title: 'X League — Privacy',
  description: 'What X League collects, why, and how to get rid of it.',
  robots: { index: true, follow: true },
};

export default function Privacy() {
  return (
    <Legal title="Privacy" updated="1 September 2026">
      <p className="lede">
        X League is a five-a-side football app: it books pitches, runs cups, and keeps a record of
        how people played. This says what it stores to do that, and what it does not.
      </p>

      <h2>What we collect</h2>
      <p>Only what the app needs to work. There is no analytics SDK and no advertising in it.</p>
      <ul>
        <li>
          <b>Your mobile number.</b> It is how you sign in. It is never shown to venues or to other
          players.
        </li>
        <li>
          <b>Your name</b> as you type it, and <b>the area you play in</b> if you give one.
        </li>
        <li>
          <b>A photograph</b>, if you choose to add one — your card portrait, or a club crest. It is
          optional and can be removed.
        </li>
        <li>
          <b>Your football record.</b> Bookings, matches, scores, goals and assists, the ratings
          other players gave you and the ones you gave them, your points and your cups.
        </li>
        <li>
          <b>Your clubs and teams</b>, and who is in them.
        </li>
        <li>
          <b>Messages</b> you send in a match lobby, a team room or a club room, and reports you
          submit.
        </li>
        <li>
          <b>If you run a venue:</b> the venue&rsquo;s details, its hours and prices, and the
          bookings taken there.
        </li>
      </ul>

      <h2>What we never collect</h2>
      <ul>
        <li>
          <b>Card or bank details.</b> A pitch is paid in cash at the venue. A cup entry is paid
          directly to X League by transfer or wallet, outside the app — we see the reference you
          type in, and nothing else.
        </li>
        <li>Your location. The app does not ask for it and does not track you.</li>
        <li>Your contacts, your camera roll beyond the photo you pick, or your other apps.</li>
      </ul>

      <h2>Who else sees it</h2>
      <ul>
        <li>
          <b>Other players</b> see your name, your photo if you added one, your card and your
          record. They never see your phone number.
        </li>
        <li>
          <b>A venue</b> sees the name and arrival details for a booking made with it.
        </li>
        <li>
          <b>X League staff</b> see what they need to verify a venue, admit a club, run a cup, and
          act on a report.
        </li>
        <li>
          <b>Supabase</b> hosts the database, the sign-in system and the photographs, on servers in
          Ireland (eu-west-1). Nobody else processes your data, and none of it is sold.
        </li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Until you delete your account. When you do, your account and the things that are yours alone
        go with it. Records that belong to other people as well — a match somebody else played in, a
        booking a venue took — keep the fact and lose your name.
      </p>

      <h2>Deleting your account</h2>
      <p>
        In the app: <b>Me → Delete my account</b>. It takes two taps and it is immediate. You can
        also ask us from <a href="/delete-account">this page</a> without installing anything. If you
        captain a club or are a venue&rsquo;s only owner, hand that over first — other people depend
        on it, and the app will tell you which.
      </p>

      <h2>Your rights</h2>
      <p>
        Ask us for a copy of what we hold, ask us to correct it, or ask us to delete it. Write to
        the address below and we will answer within 30 days.
      </p>

      <h2>Age, and children</h2>
      <p>
        X League is open to players of any age, because football is. That means some of the people
        here are children, and we treat that as the responsibility it is:
      </p>
      <ul>
        <li>
          A player under 18 needs a parent or guardian&rsquo;s permission to use X League, and a
          parent or guardian may ask us for their child&rsquo;s data or its deletion at any time.
        </li>
        <li>
          We ask for a <b>year of birth</b> rather than a date, because a year is all a
          competition&rsquo;s minimum age needs and it is markedly less to hold about a child.
        </li>
        <li>
          Every cup states a minimum age. It is 15 unless the cup says otherwise.
        </li>
        <li>We show no advertising to anybody, and we profile nobody.</li>
      </ul>

      <h2>Changes</h2>
      <p>
        If this changes in a way that matters, the app will say so before you carry on using it.
      </p>
    </Legal>
  );
}
