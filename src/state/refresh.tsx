import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * One button that makes the screen you are on ask again.
 *
 * Every screen here loads once, in an effect, and then holds what it got. That
 * is fine until something changes elsewhere — a cup opens, a result is agreed,
 * an invitation arrives — and the only way to see it is to kill the app and
 * open it again. Pull-to-refresh exists on some screens, but it is invisible,
 * it does not exist on the ones that do not scroll, and nobody discovers it.
 *
 * This is a counter. `refresh()` increments it; a screen puts `tick` in the
 * dependency list of the effect that loads its data, and that is the whole
 * mechanism. It is deliberately not a cache or a store: there is nothing to go
 * stale, and a screen that has not opted in simply ignores it.
 */
type RefreshValue = { tick: number; refresh: () => void };

const RefreshContext = createContext<RefreshValue | null>(null);

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  const value = useMemo(() => ({ tick, refresh }), [tick, refresh]);
  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

/** The counter to put in an effect's dependencies. */
export function useRefreshTick(): number {
  return useContext(RefreshContext)?.tick ?? 0;
}

/** The button's half of it. */
export function useRefresh(): () => void {
  const ctx = useContext(RefreshContext);
  return ctx?.refresh ?? (() => {});
}
