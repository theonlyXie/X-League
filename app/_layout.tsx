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
import { View } from 'react-native';
import { BookingProvider } from '@/state/booking';
import { SessionProvider } from '@/state/session';
import { void_ } from '@/theme/tokens';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  // Hold the Void ground until Inter is ready so type never reflows from a
  // fallback face into the real one.
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: void_.bg }} />;

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <BookingProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: void_.bg } }}>
            <Stack.Screen name="(player)" />
            <Stack.Screen name="owner" />
            <Stack.Screen name="admin" />
            <Stack.Screen name="sign-in" options={{ presentation: 'modal' }} />
          </Stack>
        </BookingProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
