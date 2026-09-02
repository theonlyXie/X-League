import { Stack } from 'expo-router';
import { void_ } from '@/theme/tokens';

/**
 * Clubs are a stack, not a tab. Founding one, then filling it, then entering
 * something with it is a journey with a back button at every step — which is
 * what a stack is and what a tab is not.
 *
 * The screens are left undeclared on purpose. Every route under this folder is
 * picked up on its own, and a declared name that does not match a generated one
 * is a silent no-op — worse than saying nothing.
 *
 * One club lives at `[id]/index.tsx`, not `[id].tsx`, so the folder is the only
 * thing that answers to `[id]`. A file and a folder of the same name is legal
 * and ambiguous, and this route was the only place in the app with both.
 */
export default function ClubsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: void_.bg },
      }}
    />
  );
}
