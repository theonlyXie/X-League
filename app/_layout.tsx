import { ReactNode, useEffect, useState } from 'react';
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
import { SessionProvider, useSession } from '@/state/session';
import { SettingsProvider } from '@/state/settings';
import { VenuesProvider } from '@/state/venues';
import { isLive } from '@/lib/supabase';
import { loadLiveVenues } from '@/lib/venueConfig';
import { void_ } from '@/theme/tokens';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
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
      </SessionProvider>
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
  const { signedIn, restoring } = useSession();
  const segments = useSegments();
  const [venuesReady, setVenuesReady] = useState(!isLive);

  useEffect(() => {
    if (!isLive) return;
    loadLiveVenues().finally(() => setVenuesReady(true));
  }, []);

  if (!fontsLoaded || !ready || (isLive && restoring) || !venuesReady) {
    return <View style={{ flex: 1, backgroundColor: void_.bg }} />;
  }

  const root = segments[0];
  const inOnboarding = root === 'onboarding';
  const inSignIn = root === 'sign-in';

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: void_.bg } }}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(player)" />
        <Stack.Screen name="owner" />
        <Stack.Screen name="admin" />
      </Stack>
      {isLive && !signedIn && !inSignIn ? <Redirect href="/sign-in" /> : null}
      {!isLive && !profile.onboarded && !inOnboarding ? <Redirect href="/onboarding" /> : null}
      {!isLive && profile.onboarded && inOnboarding ? <Redirect href="/" /> : null}
      {isLive && signedIn && !profile.onboarded && !inOnboarding && !inSignIn ? (
        <Redirect href="/onboarding" />
      ) : null}
    </>
  );
}
