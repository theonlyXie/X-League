import { ReactNode } from 'react';
import { isLive } from '@/lib/supabase';
import { DemoBookingProvider, useDemoBooking } from '@/state/bookingDemo';
import { LiveBookingProvider, useLiveBooking } from '@/state/bookingLive';
import type { BookingContextValue } from '@/state/bookingTypes';

export type { HoldState, SavedBooking } from '@/state/bookingTypes';

/** Routes to Supabase live booking or local demo booking based on env config. */
export function BookingProvider({ children }: { children: ReactNode }) {
  if (isLive) return <LiveBookingProvider>{children}</LiveBookingProvider>;
  return <DemoBookingProvider>{children}</DemoBookingProvider>;
}

export function useBooking(): BookingContextValue {
  if (isLive) return useLiveBooking();
  return useDemoBooking();
}

export function useActiveBooking() {
  const { activeBooking, slotLabel, slotEndLabel } = useBooking();
  if (!activeBooking) return null;
  return { ...activeBooking, slotLabel, slotEndLabel };
}
