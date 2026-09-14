import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Txt } from '@/components/Txt';
import { OpRow, OpScreen, OpSection } from '@/components/operative';
import { ChevronRight } from '@/components/icons';
import { ink, onOperative } from '@/theme/tokens';
import { useSession } from '@/state/session';
import { useI18n } from '@/i18n';

/**
 * The venue's own configuration.
 *
 * Verification is deliberately absent: a venue cannot mark itself verified,
 * which is the entire value of the badge. It is set by the platform, and the
 * venue sees the result rather than the control.
 */
/**
 * Keys rather than labels. All ten of these had Arabic sitting unused in the
 * string table while this menu rendered English in both languages — the same
 * shape of bug as the tab bar, and equally invisible to key parity, which can
 * only check that a key exists and never that a screen reached for it.
 */
const ITEMS = [
  { label: 'ownHours', hint: 'ownHoursBlurb', route: '/owner/setup/hours' },
  { label: 'ownPricing', hint: 'ownPricingBlurb', route: '/owner/setup/pricing' },
  { label: 'ownClosures', hint: 'ownClosuresBlurb', route: '/owner/setup/closures' },
  { label: 'ownStaff', hint: 'ownStaffBlurb', route: '/owner/setup/staff' },
  { label: 'ownBooking', hint: 'ownBookingBlurb', route: '/owner/setup/booking' },
  { label: 'ownMoneyIn', hint: 'ownMoneyInBlurb', route: '/owner/setup/money-in' },
  { label: 'ownProfile', hint: 'ownProfileBlurb', route: '/owner/setup/profile' },
] as const;

export default function OwnerSetup() {
  const { t } = useI18n();
  const router = useRouter();
  const { activeVenue } = useSession();
  const venue = activeVenue;

  return (
    <OpScreen>
      <OpSection title={venue?.name ?? t.ownSetup} hint={venue ? t.ownSignedInAs(venue.role) : undefined}>
        <View style={{ gap: 8 }}>
          {ITEMS.map((item) => (
            <OpRow key={item.route} onPress={() => router.push(item.route as never)}>
              <View style={{ flex: 1, gap: 3 }}>
                <Txt size={13.5} weight="semibold" color={ink}>
                  {t[item.label]}
                </Txt>
                <Txt size={10.5} color="rgba(20,18,16,.45)">
                  {t[item.hint]}
                </Txt>
              </View>
              <ChevronRight size={14} color={onOperative.dim} />
            </OpRow>
          ))}
        </View>
      </OpSection>
    </OpScreen>
  );
}
