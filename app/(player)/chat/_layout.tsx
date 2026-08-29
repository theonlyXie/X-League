import { Stack } from 'expo-router';
import { void_ } from '@/theme/tokens';

/** P-12 and P-14: the list of rooms, and one thread. */
export default function ChatLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: void_.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
