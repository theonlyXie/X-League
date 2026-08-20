import { ReactNode } from 'react';
import { isLive } from '@/lib/supabase';
import { useProfile } from '@/state/profile';
import { DemoVenuesProvider, useDemoVenues } from '@/state/venuesDemo';
import { LiveVenuesProvider, useLiveVenues } from '@/state/venuesLive';

export type { VenueSubmission, VenueSubmissionStatus } from '@/state/venuesTypes';

export function VenuesProvider({ children }: { children: ReactNode }) {
  if (isLive) return <LiveVenuesProvider>{children}</LiveVenuesProvider>;
  return <DemoVenuesProvider>{children}</DemoVenuesProvider>;
}

export function useVenues() {
  if (isLive) return useLiveVenues();
  return useDemoVenues();
}

/** Latest venue submission for the signed-in profile. */
export function useMyVenueSubmission() {
  const { profile } = useProfile();
  const { submissionForOwner, ...rest } = useVenues();
  const mine = submissionForOwner(profile.firstName);
  return { ...rest, mine };
}
