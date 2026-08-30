import { Stack } from 'expo-router';
import { void_ } from '@/theme/tokens';

/**
 * Clubs are a stack, not a tab. Founding one, then filling it, then entering
 * something with it is a journey with a back button at every step — which is
 * what a stack is and what a tab is not.
 */
export default function ClubsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: void_.bg },
      }}
    />
  );
}
