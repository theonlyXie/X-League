import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Txt } from '@/components/Txt';
import { OpHeading, OpMenuGroup, OpMenuRow, OpPage, opIconInk, type OpTone } from '@/components/kitOperative';
import { Calendar, Ban, Clock, Home, PriceTag, Users, Wallet } from '@/components/icons';
import { ink, onOperative, operative, radius } from '@/theme/tokens';
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
 *
 * Grouped the way a venue thinks about them: what it sells and when, then who
 * works it and how it is paid, then how it looks to players. Pricing and money
 * in carry the gold tile because on this surface gold means money.
 */
const GROUPS = [
  [
    { label: 'ownHours', hint: 'ownHoursBlurb', route: '/owner/setup/hours', Icon: Clock, tone: 'plain' },
    { label: 'ownPricing', hint: 'ownPricingBlurb', route: '/owner/setup/pricing', Icon: PriceTag, tone: 'money' },
    { label: 'ownClosures', hint: 'ownClosuresBlurb', route: '/owner/setup/closures', Icon: Ban, tone: 'plain' },
  ],
  [
    { label: 'ownStaff', hint: 'ownStaffBlurb', route: '/owner/setup/staff', Icon: Users, tone: 'plain' },
    { label: 'ownBooking', hint: 'ownBookingBlurb', route: '/owner/setup/booking', Icon: Calendar, tone: 'plain' },
    { label: 'ownMoneyIn', hint: 'ownMoneyInBlurb', route: '/owner/setup/money-in', Icon: Wallet, tone: 'money' },
  ],
  [{ label: 'ownProfile', hint: 'ownProfileBlurb', route: '/owner/setup/profile', Icon: Home, tone: 'plain' }],
] as const;

export default function OwnerSetup() {
  const { t } = useI18n();
  const router = useRouter();
  const { activeVenue } = useSession();
  const venue = activeVenue;

  return (
    <OpPage gap={16}>
      <OpHeading title={t.ownSetup} />

      {/* Whose setup this is, the way the account screen opens with who you
          are: the menu below changes this venue and no other. */}
      {venue ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 13,
            padding: 14,
            borderRadius: radius.cardInner,
            borderWidth: 1,
            borderColor: onOperative.hairline,
            backgroundColor: operative.surface,
          }}
        >
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: radius.pill,
              backgroundColor: operative.band,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Txt size={15} weight="bold" color={ink}>
              {venue.name.slice(0, 2).toUpperCase()}
            </Txt>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt size={16} weight="bold" color={ink} numberOfLines={1}>
              {venue.name}
            </Txt>
            <Txt size={12} color={onOperative.muted}>
              {/* The role as a word, not its enum value — this read "Signed
                  in as manager" in English inside an Arabic sentence. */}
              {t.ownSignedInAs(
                venue.role === 'owner'
                  ? t.ownerRoleOwner
                  : venue.role === 'manager'
                    ? t.ownerRoleManager
                    : t.ownerRoleStaff,
              )}
            </Txt>
          </View>
        </View>
      ) : null}

      {GROUPS.map((group, g) => (
        <OpMenuGroup key={g}>
          {group.map((item) => (
            <OpMenuRow
              key={item.route}
              icon={<item.Icon size={19} color={opIconInk(item.tone as OpTone)} />}
              tone={item.tone as OpTone}
              title={t[item.label]}
              detail={t[item.hint]}
              onPress={() => router.push(item.route as never)}
            />
          ))}
        </OpMenuGroup>
      ))}
    </OpPage>
  );
}
