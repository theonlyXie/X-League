/**
 * Where the published documents live.
 *
 * Both stores require a privacy policy at a URL anybody can open, and Play
 * wants an account-deletion page as well. They are served by the console
 * deployment — the only public web surface this project has — and its domain is
 * not something that can be guessed from inside the repository, so it is
 * configured once here.
 *
 * Until it is set, the app shows the sentence without the links rather than
 * offering a tap that goes nowhere. A dead link on the sign-up screen is worse
 * than no link, and it is exactly what a reviewer taps first.
 */
const base = (process.env.EXPO_PUBLIC_LEGAL_BASE_URL ?? '').replace(/\/+$/, '');

export const legalConfigured =
  base.startsWith('http') && !base.includes('PUT-THE-CONSOLE-DOMAIN-HERE');

export const TERMS_URL = `${base}/terms`;
export const PRIVACY_URL = `${base}/privacy`;
export const DELETE_ACCOUNT_URL = `${base}/delete-account`;
