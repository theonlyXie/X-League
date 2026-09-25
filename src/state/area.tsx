import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSession } from '@/state/session';

/**
 * Where the player is looking for a pitch.
 *
 * The redesign opens Home with a location line — the place the feed is for,
 * and the way to change it. X League does not ask a phone where it is: every
 * venue sits in a governorate, and a player gave theirs when they joined, so
 * that is the default. Changing it here changes what Home and Search show on
 * this phone and nothing else; the governorate on the player's profile is
 * theirs to set, and a tap on a header while visiting Alexandria should not
 * quietly move them there.
 *
 * `null` is all of Egypt.
 */

const KEY = 'xl.browseArea';
/** Stored when somebody deliberately picked "all of Egypt", as opposed to never having picked. */
const ALL = '*';

type AreaValue = {
  area: string | null;
  setArea: (code: string | null) => void;
  /** True once the player has chosen for themselves, rather than inheriting their profile's. */
  chosen: boolean;
};

const AreaContext = createContext<AreaValue | null>(null);

export function AreaProvider({ children }: { children: ReactNode }) {
  const { governorate } = useSession();
  const [picked, setPicked] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => setPicked(v === null ? undefined : v === ALL ? null : v))
      .catch(() => {});
  }, []);

  const setArea = useCallback((code: string | null) => {
    setPicked(code);
    AsyncStorage.setItem(KEY, code ?? ALL).catch(() => {});
  }, []);

  const value = useMemo<AreaValue>(
    () => ({
      area: picked === undefined ? governorate : picked,
      setArea,
      chosen: picked !== undefined,
    }),
    [picked, governorate, setArea],
  );

  return <AreaContext.Provider value={value}>{children}</AreaContext.Provider>;
}

export function useArea(): AreaValue {
  const ctx = useContext(AreaContext);
  if (!ctx) throw new Error('useArea outside AreaProvider');
  return ctx;
}
