/**
 * The one thing in the published documents that is not written yet.
 *
 * A privacy policy and a set of terms are only any use if somebody can reach a
 * human through them, and both stores check that the address works. Nobody can
 * invent this on X League's behalf: put the real inbox here, once, and it
 * appears in all three public pages and in the app's own copy.
 */
export const CONTACT_EMAIL = 'PUT-THE-REAL-ADDRESS-HERE@example.com';

/** True while the line above is still the placeholder. */
export const CONTACT_IS_PLACEHOLDER = CONTACT_EMAIL.includes('PUT-THE-REAL-ADDRESS-HERE');
