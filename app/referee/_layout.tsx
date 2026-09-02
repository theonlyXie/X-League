import { Stack } from 'expo-router';
import { void_ } from '@/theme/tokens';

/**
 * The referee's two screens: the list of cup matches, and the one they are
 * standing on the touchline of. A stack, because the second is a step into the
 * first and has a back button.
 */
export default function RefereeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: void_.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]/index" />
    </Stack>
  );
}
