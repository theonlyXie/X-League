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
const ITEMS = [
  { label: 'Hours and pitches', hint: 'When you open, and what you open', route: '/owner/setup/hours' },
  { label: 'Pricing', hint: 'What each hour sells for', route: '/owner/setup/pricing' },
  { label: 'Closures', hint: 'Take hours off sale', route: '/owner/setup/closures' },
  { label: 'Staff', hint: 'Who can work the gate', route: '/owner/setup/staff' },
  { label: 'Venue profile', hint: 'What players see', route: '/owner/setup/profile' },
];

export default function OwnerSetup() {
  const { t } = useI18n();
  const router = useRouter();
  const { venues } = useSession();
  const venue = venues[0] ?? null;

  return (
    <OpScreen>
      <OpSection title={venue?.name ?? t.ownSetup} hint={venue ? `Signed in as ${venue.role}` : undefined}>
        <View style={{ gap: 8 }}>
          {ITEMS.map((item) => (
            <OpRow key={item.label} onPress={() => router.push(item.route as never)}>
              <View style={{ flex: 1, gap: 3 }}>
                <Txt size={13.5} weight="semibold" color={ink}>
                  {item.label}
                </Txt>
                <Txt size={10.5} color="rgba(20,18,16,.45)">
                  {item.hint}
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
