import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as api from '@/data/api';
import { isLive } from '@/lib/supabase';
import { useSession } from '@/state/session';

/**
 * The signed-in player's card.
 *
 * Null when there is no snapshot yet — which is the state a new account is in
 * until the anchored assessment is done, and what the profile screen uses to
 * offer it rather than showing somebody else's numbers.
 */
type CardContextValue = {
  card: api.Card | null;
  loading: boolean;
  /** True when the card shown is the design's fixture rather than this player's. */
  isFixture: boolean;
  reload: () => Promise<void>;
};

const CardContext = createContext<CardContextValue | null>(null);

export function CardProvider({ children }: { children: ReactNode }) {
  const { signedIn } = useSession();
  const [card, setCard] = useState<api.Card | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!isLive || !signedIn) {
      setCard(null);
      return;
    }
    setLoading(true);
    try {
      setCard(await api.myCard());
    } catch {
      setCard(null);
    } finally {
      setLoading(false);
    }
  }, [signedIn]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo<CardContextValue>(
    () => ({ card, loading, isFixture: !isLive || !signedIn, reload }),
    [card, loading, signedIn, reload],
  );

  return <CardContext.Provider value={value}>{children}</CardContext.Provider>;
}

export function useCard() {
  const ctx = useContext(CardContext);
  if (!ctx) throw new Error('useCard must be used inside a CardProvider');
  return ctx;
}
