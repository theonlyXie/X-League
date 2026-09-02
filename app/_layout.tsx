import { useEffect, useRef, useState } from 'react';
import { Stack, usePathname, useRootNavigationState, useRouter, useSegments } from 'expo-router';
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
import { Alert, View } from 'react-native';
import { BookingProvider } from '@/state/booking';
import { SessionProvider, useSession } from '@/state/session';
import { CardProvider } from '@/state/card';
import { RefreshProvider } from '@/state/refresh';
import { Boundary } from '@/components/Boundary';
import { installLastResortHandler } from '@/lib/lastResort';
import { noteScreen, takeCrash } from '@/lib/breadcrumb';
import { I18nProvider } from '@/i18n';
import { isLive } from '@/lib/supabase';
import { void_ } from '@/theme/tokens';

// Installed once, at module scope, so it is in place before anything renders
// and before any effect has had a chance to throw.
installLastResortHandler();

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
    // A render that throws used to take the whole app with it, and what came
    // back was "it crashes" with nothing to read. Now it says what happened.
    <Boundary>
    <SafeAreaProvider>
      <I18nProvider>
        <SessionProvider>
        <CardProvider>
          <BookingProvider>
          <RefreshProvider>
          <StatusBar style="light" />
          <Gate />
          <Trail />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: void_.bg } }}>
            <Stack.Screen name="(player)" />
            <Stack.Screen name="owner" />
            <Stack.Screen name="teams" />
            {/* Declared for the same reason as its neighbours, not as a fix:
                undeclared routes are appended anyway. It was the one omission
                in this list and it cost nothing to close. */}
            <Stack.Screen name="clubs" />
            <Stack.Screen name="bookings" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="points" />
            <Stack.Screen name="leaderboard" />
            {/* Not a modal any more. It is the first thing the app shows to
                somebody with no account, and a modal reads as an interruption
                of a screen behind it — here there is nothing behind it. */}
            <Stack.Screen name="sign-in" />
            <Stack.Screen name="open-a-venue" />
            <Stack.Screen name="blocked" />
            <Stack.Screen name="onboarding" />
          </Stack>
          </RefreshProvider>
          </BookingProvider>
        </CardProvider>
        </SessionProvider>
      </I18nProvider>
    </SafeAreaProvider>
    </Boundary>
  );
}

/**
 * The breadcrumb, wired to the router.
 *
 * The note is read before the first one is written, or the launch after a
 * crash would overwrite the evidence with the screen it landed on. Until that
 * read finishes nothing is recorded, which costs a frame or two of trail and
 * is worth it.
 *
 * What it shows is in English on purpose. It is meant to be screenshotted and
 * sent, and a translated crash report is a crash report nobody can search.
 */
function Trail() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const told = useRef(false);

  useEffect(() => {
    let cancelled = false;
    takeCrash().then((where) => {
      if (cancelled) return;
      if (where && !told.current) {
        told.current = true;
        Alert.alert(
          'X League closed unexpectedly',
          `Last screen: ${where}\n\nScreenshot this and send it on.`,
        );
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !pathname) return;
    noteScreen(pathname);
  }, [ready, pathname]);

  return null;
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
