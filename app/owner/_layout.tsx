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
      </Tabs>
    </View>
  );
}
