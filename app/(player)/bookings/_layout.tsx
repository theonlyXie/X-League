import { Stack } from 'expo-router';
import { void_ } from '@/theme/tokens';

export default function BookingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: void_.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[code]" />
    </Stack>
  );
}
