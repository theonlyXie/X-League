/**
 * Every route the app serves, and what may be said about it without an
 * account.
 *
 * `signedOut: 'showcase'` means the design's sample data is the correct thing
 * to draw — there is no account to show instead, and the screen says so. Those
 * are the only three surfaces where a fixture is legitimate, and the leak
 * check skips them when signed out and enforces them when signed in.
 */

export const ROUTES = [
  // Player
  { path: '/', name: 'Home', signedOut: 'showcase' },
  { path: '/play', name: 'Play' },
  { path: '/me', name: 'Card', signedOut: 'showcase' },
  { path: '/points', name: 'XP ledger' },
  { path: '/notifications', name: 'Notifications' },
  { path: '/bookings', name: 'Booking history' },
  // Reached cold with a code that belongs to nobody, which is the case that
  // has to say so rather than render an empty shell.
  { path: '/bookings/XL-NONE', name: 'Booking detail' },
  { path: '/onboarding', name: 'Onboarding' },
  { path: '/sign-in', name: 'Sign in' },
  { path: '/chat', name: 'Chat' },
  { path: '/cups', name: 'Cups' },
  { path: '/teams', name: 'Teams' },
  { path: '/clubs', name: 'Clubs' },
  { path: '/leaderboard', name: 'Leaderboards' },

  // The booking spine's later screens need state to be meaningful, but they
  // must still render rather than crash when reached cold.
  { path: '/play/pitch', name: 'Pitch' },
  { path: '/play/checkout', name: 'Checkout' },
  { path: '/play/confirmation', name: 'Confirmation' },
  { path: '/play/lobby', name: 'Lobby' },
  { path: '/play/invite', name: 'Invite' },
  { path: '/play/rate', name: 'Rate' },
  { path: '/play/result', name: 'Result' },

  // Reached cold with an id that belongs to nobody, which is the case that has
  // to say so rather than render a club-shaped empty shell.
  { path: '/clubs/00000000-0000-0000-0000-000000000000', name: 'Club detail' },
  { path: '/cups/enter/00000000-0000-0000-0000-000000000000', name: 'Enter a cup' },
  { path: '/cups/draw/00000000-0000-0000-0000-000000000000', name: 'The draw' },

  // Owner
  { path: '/owner', name: 'Owner today', signedOut: 'showcase' },
  { path: '/owner/calendar', name: 'Owner calendar', signedOut: 'showcase' },
  { path: '/owner/money', name: 'Owner money' },
  { path: '/owner/reviews', name: 'Owner reviews' },
  { path: '/owner/customers', name: 'Owner customers' },
  { path: '/owner/setup', name: 'Owner setup' },
  { path: '/owner/setup/hours', name: 'Hours and pitches' },
  { path: '/owner/setup/pricing', name: 'Pricing' },
  { path: '/owner/setup/closures', name: 'Closures' },
  { path: '/owner/setup/staff', name: 'Staff' },
  { path: '/owner/setup/profile', name: 'Venue profile' },

];

/**
 * Routes that draw the design's sample content when reached without an
 * account, and so are exempt from the Arabic-copy assertion only.
 *
 * The distinction `rtl` needs is between the app's own chrome — tabs, labels,
 * hints, buttons, every word the product writes — which must be Arabic, and
 * the design's sample arrivals and gate notes, which are English because they
 * were drawn in English. Holding the fixtures to the same standard would fail
 * these three routes forever on content no real user's data ever passes
 * through, and a permanently red check is one people learn to skip.
 *
 * Direction and mirrored layout are still asserted here, and the exemption is
 * printed rather than applied silently. Translating the sample data set is
 * real work that has not been done — see the README's honest list.
 */
export const FIXTURE_COPY_WHEN_SIGNED_OUT = ['/owner', '/owner/calendar', '/play/confirmation'];

/** The surfaces a signed-in player should never see a fixture on. */
export const PLAYER_SURFACES = [
  '/',
  '/me',
  '/play',
  '/points',
  '/notifications',
  '/bookings',
  '/chat',
  '/teams',
  '/cups',
  '/clubs',
  '/leaderboard',
];

/** The surfaces a signed-in venue owner should never see a fixture on. */
export const OWNER_SURFACES = [
  '/owner',
  '/owner/calendar',
  '/owner/money',
  '/owner/reviews',
  '/owner/customers',
  '/owner/setup',
  '/owner/setup/hours',
  '/owner/setup/pricing',
  '/owner/setup/closures',
  '/owner/setup/staff',
  '/owner/setup/profile',
];

/**
 * Screens that exist to show you your own data, and so must ask for it.
 *
 * A screen here that renders without opening a connection is not passing — it
 * is drawing something it did not get from the database, which is the defect
 * this whole harness was built around.
 *
 * This list is evidence, not intent: every entry was observed making the call
 * on a signed-in run. Screens deliberately absent are the ones that legitimately
 * render from state carried in from a previous screen (the later booking steps),
 * from nothing at all (sign-in, onboarding), or from a menu of links
 * (`/owner/setup`).
 */
export const MUST_REACH_BACKEND = [
  '/',
  '/me',
  '/play',
  '/points',
  '/notifications',
  '/bookings',
  '/chat',
  '/teams',
  '/cups',
  '/clubs',
  '/leaderboard',
  '/owner',
  '/owner/calendar',
  '/owner/money',
  '/owner/reviews',
  '/owner/customers',
  '/owner/setup/hours',
  '/owner/setup/pricing',
  '/owner/setup/closures',
  '/owner/setup/staff',
  '/owner/setup/profile',
];
