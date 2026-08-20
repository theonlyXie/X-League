import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Eyebrow } from '@/components/ui';
import { gold, ink, onOperative, operative, radius } from '@/theme/tokens';
import { useMyVenueSubmission } from '@/state/venues';

/** Shown while the owner's venue listing awaits admin approval. */
export default function OwnerPending() {
  const router = useRouter();
  const { mine } = useMyVenueSubmission();

  useEffect(() => {
    if (mine?.status === 'approved') router.replace('/owner');
  }, [mine?.status, router]);

  if (!mine) {
    return (
      <Screen surface="operative" contentStyle={{ padding: 22, gap: 12 }}>
        <Txt size={18} weight="bold" color={ink}>
          No submission yet
        </Txt>
        <Button label="Register a venue" variant="operative" onPress={() => router.replace('/owner/register')} />
      </Screen>
    );
  }

  if (mine.status === 'approved') return null;

  if (mine.status === 'rejected') {
    return (
      <Screen surface="operative" contentStyle={{ padding: 22, gap: 16 }}>
        <Eyebrow color={onOperative.faint}>Not approved</Eyebrow>
        <Txt size={22} weight="bold" color={ink}>
          {mine.name}
        </Txt>
        <Txt size={14} color={onOperative.secondary} lh={1.5}>
          {mine.rejectionReason ?? 'Your listing was not approved. Contact ops or submit again with corrected details.'}
        </Txt>
        <Button label="Submit again" variant="operative" onPress={() => router.replace('/owner/register')} />
        <Button label="Back to player mode" variant="ghost" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen surface="operative" contentStyle={{ paddingTop: 24, paddingHorizontal: 22, paddingBottom: 32, gap: 18 }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: radius.pill,
          backgroundColor: 'rgba(198,163,75,.18)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Txt size={18} weight="bold" color={gold.ink}>
          …
        </Txt>
      </View>
      <View style={{ gap: 8 }}>
        <Eyebrow color={onOperative.faint}>Pending approval</Eyebrow>
        <Txt size={26} weight="bold" em={-0.02} color={ink}>
          {mine.name}
        </Txt>
        <Txt size={14} color={onOperative.secondary}>
          {mine.area} · submitted by {mine.ownerName}
        </Txt>
      </View>
      <Txt size={14} lh={1.55} color={onOperative.muted}>
        X League admin will verify your venue before it appears in player search and before you can run the owner calendar. This usually takes one business day.
      </Txt>
      <Button label="Back to player mode" variant="operative" onPress={() => router.replace('/')} />
    </Screen>
  );
}
