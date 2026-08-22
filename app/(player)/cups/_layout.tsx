import { Stack } from 'expo-router';
import { void_ } from '@/theme/tokens';

/** P-15 – P-20 live inside the Cups tab, so the tick stays gold throughout. */
export default function CupsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: void_.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
