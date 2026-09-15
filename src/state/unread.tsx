import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { unreadNotifications } from '@/data/social';
import { isLive } from '@/lib/supabase';
import { useSession } from '@/state/session';

/**
 * How many notifications are waiting, counted once for the whole app.
 *
 * The bell is drawn on four screens and all four are mounted at the same time
 * — expo-router keeps a tab's screen alive once visited — so a count fetched
 * inside the bell would be four pollers asking the same question on four
 * separate timers. It is one question, so it is asked in one place.
 *
 * Polled rather than pushed: there is no realtime subscription yet, and a
 * count that is a minute stale is still better than no count at all. Signing
 * out zeroes it rather than leaving the last number on screen.
 */
type UnreadValue = { unread: number; refreshUnread: () => void };

const UnreadContext = createContext<UnreadValue | null>(null);

export function UnreadProvider({ children }: { children: ReactNode }) {
  const { signedIn } = useSession();
  const [unread, setUnread] = useState(0);
  // Bumped by `refreshUnread`, which is what a screen calls after doing
  // something that changes the count — opening the notifications list, mostly.
  const [tick, setTick] = useState(0);

  const refreshUnread = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!isLive || !signedIn) {
      setUnread(0);
      return;
    }
    let cancelled = false;
    const read = () => {
      unreadNotifications()
        .then((n) => {
          if (!cancelled) setUnread(n);
        })
        .catch(() => {
          /* A count that cannot be read is not worth an error on screen. */
        });
    };
    read();
    const timer = setInterval(read, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [signedIn, tick]);

  const value = useMemo(() => ({ unread, refreshUnread }), [unread, refreshUnread]);
  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export function useUnread(): UnreadValue {
  return useContext(UnreadContext) ?? { unread: 0, refreshUnread: () => {} };
}
