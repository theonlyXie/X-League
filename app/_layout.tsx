import { Stack } from 'expo-router';
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
import { SessionProvider } from '@/state/session';
import { CardProvider } from '@/state/card';
import { I18nProvider } from '@/i18n';
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
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: void_.bg } }}>
            <Stack.Screen name="(player)" />
            <Stack.Screen name="owner" />
            <Stack.Screen name="admin" />
            <Stack.Screen name="teams" />
            <Stack.Screen name="bookings" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="points" />
            <Stack.Screen name="sign-in" options={{ presentation: 'modal' }} />
            <Stack.Screen name="onboarding" />
          </Stack>
          </BookingProvider>
        </CardProvider>
        </SessionProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
