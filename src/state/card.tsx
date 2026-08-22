import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as api from '@/data/api';
import { myCardEvidence, myMatchEvidence, type CardEvidence, type MatchEvidence } from '@/data/progress';
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
  /**
   * What stands behind the card: verified matches, how many people rated, XP
   * and the last five results. PRO-007 asks the card to expose its evidence
   * rather than imply it, so these are shown rather than only used.
   */
  evidence: CardEvidence | null;
  /** The matches themselves, for P-09's list and the rating prompt. */
  matches: MatchEvidence[];
  loading: boolean;
  /** True when the card shown is the design's fixture rather than this player's. */
  isFixture: boolean;
  reload: () => Promise<void>;
};

const CardContext = createContext<CardContextValue | null>(null);

export function CardProvider({ children }: { children: ReactNode }) {
  const { signedIn } = useSession();
  const [card, setCard] = useState<api.Card | null>(null);
  const [evidence, setEvidence] = useState<CardEvidence | null>(null);
  const [matches, setMatches] = useState<MatchEvidence[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!isLive || !signedIn) {
      setCard(null);
      setEvidence(null);
      setMatches([]);
      return;
    }
    setLoading(true);
    try {
      // The card and its evidence are fetched together: a screen that showed
      // one without the other would be exactly the half-truth §5.1 objects to.
      const [c, e, m] = await Promise.all([
        api.myCard(),
        myCardEvidence().catch(() => null),
        myMatchEvidence(20).catch(() => [] as MatchEvidence[]),
      ]);
      setCard(c);
      setEvidence(e);
      setMatches(m);
    } catch {
      setCard(null);
      setEvidence(null);
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [signedIn]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo<CardContextValue>(
    () => ({ card, evidence, matches, loading, isFixture: !isLive || !signedIn, reload }),
    [card, evidence, matches, loading, signedIn, reload],
  );

  return <CardContext.Provider value={value}>{children}</CardContext.Provider>;
}

export function useCard() {
  const ctx = useContext(CardContext);
  if (!ctx) throw new Error('useCard must be used inside a CardProvider');
  return ctx;
}
