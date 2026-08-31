import { useEffect } from 'react';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
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
import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { View } from 'react-native';
import { BookingProvider } from '@/state/booking';
import { SessionProvider, useSession } from '@/state/session';
import { CardProvider } from '@/state/card';
import { I18nProvider } from '@/i18n';
import { isLive } from '@/lib/supabase';
import { void_ } from '@/theme/tokens';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
  });

  // Hold the Void ground until Inter is ready so type never reflows from a
  // fallback face into the real one.
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: void_.bg }} />;

  return (
    <SafeAreaProvider>
      <I18nProvider>
        <SessionProvider>
        <CardProvider>
          <BookingProvider>
          <StatusBar style="light" />
          <Gate />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: void_.bg } }}>
            <Stack.Screen name="(player)" />
            <Stack.Screen name="owner" />
            <Stack.Screen name="teams" />
            <Stack.Screen name="bookings" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="points" />
            {/* Not a modal any more. It is the first thing the app shows to
                somebody with no account, and a modal reads as an interruption
                of a screen behind it — here there is nothing behind it. */}
            <Stack.Screen name="sign-in" />
            <Stack.Screen name="open-a-venue" />
            <Stack.Screen name="onboarding" />
          </Stack>
          </BookingProvider>
        </CardProvider>
        </SessionProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

/**
 * The door.
 *
 * Signing in comes before anything else: a launch with no session lands on
 * `/sign-in` rather than on a home screen full of other people's football with
 * no way to say who you are. The database still grants anon read on cups,
 * venues and the boards on purpose — a cup nobody can see is a cup nobody
 * enters — so this is an entry requirement in the app, not a wall in the data,
 * and `browseAsGuest` is the way past it.
 *
 * Three things keep it from firing at the wrong moment:
 *
 *  - `restoring`. The stored session is read back asynchronously, so for the
 *    first frames of every launch a signed-in person looks signed out. Acting
 *    then would throw them onto the sign-in screen every time they opened the
 *    app.
 *  - the root navigation state. A `replace` before the navigator has mounted
 *    is dropped on the floor, and the app would sit on whatever it rendered.
 *  - `isLive`. A build with no database configured cannot sign anybody in, so
 *    gating it would leave nothing but a screen that refuses. That build says
 *    what is wrong on the account screen instead.
 */
function Gate() {
  const { signedIn, restoring, guest } = useSession();
  const segments = useSegments();
  const navigation = useRootNavigationState();
  const router = useRouter();

  const onSignIn = segments[0] === 'sign-in';

  useEffect(() => {
    if (!isLive) return;
    if (!navigation?.key) return;
    if (restoring) return;
    if (signedIn || guest) return;
    if (onSignIn) return;
    router.replace('/sign-in');
  }, [navigation?.key, restoring, signedIn, guest, onSignIn, router]);

  return null;
}
