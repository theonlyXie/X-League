import { Stack } from 'expo-router';
import { operative } from '@/theme/tokens';

/** O-02, O-03, O-04, O-05 and O-07 all live behind the Setup tab. */
export default function SetupLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: operative.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="hours" />
      <Stack.Screen name="pricing" />
      <Stack.Screen name="closures" />
      <Stack.Screen name="staff" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}
