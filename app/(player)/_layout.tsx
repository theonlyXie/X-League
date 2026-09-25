import { Tabs } from 'expo-router';
import { PlayerTabBar } from '@/components/PlayerTabBar';
import { void_ } from '@/theme/tokens';

export default function PlayerLayout() {
  return (
    <Tabs
      tabBar={(props) => <PlayerTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: void_.bg } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="play" />
      <Tabs.Screen name="cups" />
      <Tabs.Screen name="me" />
    </Tabs>
  );
}
