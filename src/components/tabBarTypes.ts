import type { ComponentProps } from 'react';
import { Tabs } from 'expo-router';

/**
 * expo-router does not re-export `BottomTabBarProps`, so the custom tab bars
 * take their props from the `Tabs` navigator itself. Deriving it this way keeps
 * the signature correct across router upgrades.
 */
export type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];
