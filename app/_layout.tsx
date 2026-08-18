import { Redirect, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { View } from 'react-native';
import { BookingProvider } from '@/state/booking';
import { OnboardingProvider, useOnboarding } from '@/state/onboarding';
import { void_ } from '@/theme/tokens';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <OnboardingProvider>
        <BookingProvider>
          <StatusBar style="light" />
          <RootGate />
        </BookingProvider>
      </OnboardingProvider>
    </SafeAreaProvider>
  );
}

function RootGate() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  const { ready, complete } = useOnboarding();
  const segments = useSegments();

  // Hold the Void ground until Inter is ready so type never reflows from a
  // fallback face into the real one.
  if (!fontsLoaded || !ready) return <View style={{ flex: 1, backgroundColor: void_.bg }} />;

  const inOnboarding = segments[0] === 'onboarding';

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: void_.bg } }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(player)" />
        <Stack.Screen name="owner" />
        <Stack.Screen name="admin" />
      </Stack>
      {!complete && !inOnboarding ? <Redirect href="/onboarding" /> : null}
      {complete && inOnboarding ? <Redirect href="/" /> : null}
    </>
  );
}
