import type { Metadata } from 'next';
import { Legal } from '@/components/Legal';

export const metadata: Metadata = {
  title: 'X League — Terms',
  description: 'The rules for using X League.',
  robots: { index: true, follow: true },
};

export default function Terms() {
  return (
    <Legal title="Terms of use" updated="1 September 2026">
      <p className="lede">
        Short, because most of it is obvious. Using X League means agreeing to these.
      </p>

      <h2>Who can use it</h2>
      <p>
        You must be 18 or over. One person, one account, on one mobile number — an account is yours
        and not to be shared or sold.
      </p>

      <h2>Behaviour, and what happens when it goes wrong</h2>
      <p>
        There is <b>no tolerance</b> for abusive, threatening, harassing, hateful or otherwise
        objectionable content, and none for abusive behaviour towards other players.
      </p>
      <ul>
        <li>Every message can be reported: hold it, and choose Report.</li>
        <li>Every player can be blocked: hold one of their messages, and choose Block.</li>
        <li>
          We look at reports <b>within 24 hours</b>, and we remove content and eject people who
          break this rule.
        </li>
      </ul>

      <h2>Bookings and money</h2>
      <ul>
        <li>A pitch booking is an agreement between you and that venue. Turn up, or cancel in time.</li>
        <li>The price shown is the venue&rsquo;s, paid in cash at the venue.</li>
        <li>
          A cup entry fee is paid to X League directly, outside the app. Nothing in the app takes a
          payment.
        </li>
        <li>
          Cup prizes are trophies, standing and honours. There is no cash prize and no wagering of
          any kind.
        </li>
        <li>
          SuPoints are earned by playing. They reduce an entry fee and they cannot be bought, sold
          or exchanged for money.
        </li>
      </ul>

      <h2>Venues and clubs</h2>
      <p>
        A venue is listed to players only after X League has checked it. A club can be founded by
        anybody and enters competitions only after X League admits it. Both decisions are ours, and
        we do not have to explain a refusal — though we will usually tell you what would change it.
      </p>

      <h2>Your record</h2>
      <p>
        Ratings come from the people you played with, and stats are verified through cups. We may
        correct or remove a record we believe was manipulated.
      </p>

      <h2>Ending it</h2>
      <p>
        Delete your account whenever you like, from the app or from{' '}
        <a href="/delete-account">this page</a>. We may suspend or remove an account that breaks
        these terms.
      </p>

      <h2>The boring part</h2>
      <p>
        X League is provided as it is. We do not promise a pitch will be open, that a match will go
        ahead, or that another player will behave — those are matters between you, the venue and the
        people you play with. Nothing here removes any right you have under Egyptian law.
      </p>
    </Legal>
  );
}
