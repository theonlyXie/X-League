import { Stack } from 'expo-router';
import { void_ } from '@/theme/tokens';

/**
 * Everything downstream of Play — pitch, checkout, confirmation, the match
 * lobby, filling a squad and rating it afterwards — lives inside the Play tab,
 * which is what keeps the Play tick gold through the whole booking flow, as the
 * design does.
 */
export default function PlayLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: void_.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="pitch" />
      <Stack.Screen name="checkout" />
      <Stack.Screen name="confirmation" />
      <Stack.Screen name="lobby" />
      <Stack.Screen name="invite" />
      <Stack.Screen name="rate" />
    </Stack>
  );
}
