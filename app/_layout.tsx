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
import { MessagesProvider } from '@/state/messages';
import { ProfileProvider, useProfile } from '@/state/profile';
import { SettingsProvider } from '@/state/settings';
import { VenuesProvider } from '@/state/venues';
import { void_ } from '@/theme/tokens';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <ProfileProvider>
          <VenuesProvider>
            <MessagesProvider>
              <BookingProvider>
                <StatusBar style="light" />
                <RootGate />
              </BookingProvider>
            </MessagesProvider>
          </VenuesProvider>
        </ProfileProvider>
      </SettingsProvider>
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
  const { ready, profile } = useProfile();
  const segments = useSegments();

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
      {!profile.onboarded && !inOnboarding ? <Redirect href="/onboarding" /> : null}
      {profile.onboarded && inOnboarding ? <Redirect href="/" /> : null}
    </>
  );
}
