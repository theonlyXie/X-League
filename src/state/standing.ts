import { useI18n } from '@/i18n';
import type { VenueVerification } from '@/state/session';

/**
 * The venue's standing, as words rather than an enum value.
 *
 * One place, because two screens show this and they were never going to say the
 * same thing twice by hand. The profile screen used to print
 * `Verification: ${verification}. Set by the platform, not here.` — a raw column
 * value and a line of developer-speak, hardcoded in English on a screen that is
 * otherwise fully translated.
 *
 * Null once verified. The gold badge on the venue profile already says so, and
 * a banner repeating it on every screen is noise a venue would learn to skip
 * past — which is exactly how they would come to skip past the ones that matter.
 */
export type Standing = { title: string; blurb: string; tone: 'info' | 'warn' };

export function useVenueStanding(verification: VenueVerification | undefined): Standing | null {
  const { t } = useI18n();
  if (!verification || verification === 'verified') return null;

  if (verification === 'rejected') {
    return { title: t.ownRejected, blurb: t.ownRejectedBlurb, tone: 'warn' };
  }
  if (verification === 'suspended') {
    return { title: t.ownSuspended, blurb: t.ownSuspendedBlurb, tone: 'warn' };
  }
  // Pending, and informational rather than a warning: `search_venues` lists
  // unverified venues and only ranks verified ones above them, so there is
  // nothing here for a new venue to fix or to worry about.
  return { title: t.ownPending, blurb: t.ownPendingBlurb, tone: 'info' };
}
