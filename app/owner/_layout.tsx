import { Redirect, Stack, useSegments } from 'expo-router';
import { useMyVenueSubmission } from '@/state/venues';

/**
 * Owner area: registration and pending states sit outside the shift tabs.
 * Demo Stadium One owner access remains available when there is no pending submission.
 */
export default function OwnerLayout() {
  const segments = useSegments();
  const { mine, ready } = useMyVenueSubmission();
  const leaf = segments[segments.length - 1];
  const onRegisterFlow = leaf === 'register' || leaf === 'pending';

  if (!ready) return null;

  if (mine?.status === 'pending' && !onRegisterFlow) {
    return <Redirect href="/owner/pending" />;
  }

  if (mine?.status === 'rejected' && !onRegisterFlow && leaf !== 'register') {
    return <Redirect href="/owner/pending" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="register" />
      <Stack.Screen name="pending" />
      <Stack.Screen name="(main)" />
    </Stack>
  );
}
