import { ReactNode } from 'react';
import { isLive } from '@/lib/supabase';
import { DemoAdminConsoleProvider, useDemoAdminConsole } from '@/state/adminConsoleDemo';
import { LiveAdminConsoleProvider, useLiveAdminConsole } from '@/state/adminConsoleLive';

export type { AdminConsoleContextValue } from '@/state/adminConsoleTypes';

export function AdminConsoleProvider({ children }: { children: ReactNode }) {
  if (isLive) return <LiveAdminConsoleProvider>{children}</LiveAdminConsoleProvider>;
  return <DemoAdminConsoleProvider>{children}</DemoAdminConsoleProvider>;
}

export function useAdminConsole() {
  if (isLive) return useLiveAdminConsole();
  return useDemoAdminConsole();
}
