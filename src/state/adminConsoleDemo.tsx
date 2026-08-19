import { createContext, ReactNode, useContext, useMemo } from 'react';
import { demoAdminValue, type AdminConsoleContextValue } from '@/state/adminConsoleTypes';

const AdminConsoleContext = createContext<AdminConsoleContextValue | null>(null);

export function DemoAdminConsoleProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => demoAdminValue(), []);
  return <AdminConsoleContext.Provider value={value}>{children}</AdminConsoleContext.Provider>;
}

export function useDemoAdminConsole() {
  const ctx = useContext(AdminConsoleContext);
  if (!ctx) throw new Error('useDemoAdminConsole must be used inside DemoAdminConsoleProvider');
  return ctx;
}
