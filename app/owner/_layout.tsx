import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { OwnerHeader, OwnerTabBar } from '@/components/OwnerChrome';
import { operative } from '@/theme/tokens';

export default function OwnerLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: operative.bg }}>
      <OwnerHeader />
      <Tabs
        tabBar={(props) => <OwnerTabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: operative.bg } }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="calendar" />
        <Tabs.Screen name="money" />
        <Tabs.Screen name="reviews" />
        <Tabs.Screen name="setup" />
        {/* Reachable, but not a sixth tab. `OwnerTabBar` draws its own five
            items rather than iterating the navigator's routes, so a screen
            registered here appears only when something navigates to it — which
            is what the Money screen's link does. */}
        <Tabs.Screen name="customers" />
      </Tabs>
    </View>
  );
}
