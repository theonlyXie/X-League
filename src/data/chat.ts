/**
 * Fixture data for Messages (P-10–P-12, P-14).
 * Threads are match lobbies, venue desks and competition rooms — never a
 * generic social inbox.
 */

export type ThreadKind = 'match' | 'venue' | 'cup';

export type Thread = {
  id: string;
  title: string;
  kind: ThreadKind;
  preview: string;
  when: string;
  unread: number;
};

export const THREADS: Thread[] = [
  {
    id: 'xl-7k42',
    title: 'Stadium One · 9 PM',
    kind: 'match',
    preview: "Youssef: Me. Gate 2 at 8:50.",
    when: '21:12',
    unread: 2,
  },
  {
    id: 'ok-invite',
    title: 'Omar Khaled',
    kind: 'match',
    preview: 'Needs a MID · Thu 20 Aug · The Box',
    when: '18:04',
    unread: 1,
  },
  {
    id: 'stadium-one',
    title: 'Stadium One desk',
    kind: 'venue',
    preview: 'Pitch A is open at 10 PM if you want to add a sub.',
    when: 'Tue',
    unread: 0,
  },
  {
    id: 'nasr-5s',
    title: 'Nasr City 5s',
    kind: 'cup',
    preview: 'Kick-off confirmed. Bring dark bibs.',
    when: 'Mon',
    unread: 0,
  },
];

export type ChatLine = {
  id: string;
  from: 'them' | 'you';
  initials: string;
  text: string;
  at: string;
};

export const THREAD_MESSAGES: Record<string, ChatLine[]> = {
  'xl-7k42': [
    { id: '1', from: 'them', initials: 'OK', text: "I'll bring the bibs. Who has the ball?", at: '20:58' },
    { id: '2', from: 'them', initials: 'YA', text: 'Me. Gate 2 at 8:50.', at: '21:12' },
    { id: '3', from: 'you', initials: 'BE', text: 'Cash deposit at the gate — I have the 100.', at: '21:14' },
  ],
  'ok-invite': [
    { id: '1', from: 'them', initials: 'OK', text: 'Thu 20 Aug · 8:00 PM · The Box. Need a MID, your passing is the gap.', at: '18:02' },
    { id: '2', from: 'them', initials: 'OK', text: 'Deposit is EGP 80 cash. I can hold a slot until 19:00.', at: '18:04' },
  ],
  'stadium-one': [
    { id: '1', from: 'them', initials: 'SO', text: 'Basel — Pitch A is set. Gate 2, ask for the 9 PM.', at: '17:40' },
    { id: '2', from: 'you', initials: 'BE', text: 'Noted. Four confirmed, still one defender open.', at: '17:44' },
    { id: '3', from: 'them', initials: 'SO', text: 'Pitch A is open at 10 PM if you want to add a sub.', at: '18:11' },
  ],
  'nasr-5s': [
    { id: '1', from: 'them', initials: 'NC', text: 'Kick-off confirmed. Bring dark bibs.', at: 'Mon' },
    { id: '2', from: 'you', initials: 'BE', text: 'Void FC will be there at 20:50.', at: 'Mon' },
  ],
};

export const KIND_LABEL: Record<ThreadKind, string> = {
  match: 'MATCH',
  venue: 'VENUE',
  cup: 'CUP',
};
