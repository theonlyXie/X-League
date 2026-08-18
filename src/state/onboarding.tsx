import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ATTRIBUTES, POSITIONS, Position } from '@/data/onboarding';

const STORAGE_KEY = 'xleague.onboarded.v1';

export type SelfScores = Record<(typeof ATTRIBUTES)[number]['key'], number>;

const DEFAULT_SCORES: SelfScores = { SPD: 70, SHO: 70, PAS: 70, DRI: 70, DEF: 70, PHY: 70 };

type OnboardingContextValue = {
  ready: boolean;
  complete: boolean;
  position: Position;
  setPosition: (p: Position) => void;
  scores: SelfScores;
  setScore: (key: keyof SelfScores, value: number) => void;
  finish: () => Promise<void>;
  replay: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [complete, setComplete] = useState(false);
  const [position, setPosition] = useState<Position>(POSITIONS[2]);
  const [scores, setScores] = useState<SelfScores>(DEFAULT_SCORES);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        setComplete(value === '1');
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  const setScore = useCallback((key: keyof SelfScores, value: number) => {
    setScores((prev) => ({ ...prev, [key]: value }));
  }, []);

  const finish = useCallback(async () => {
    await AsyncStorage.setItem(STORAGE_KEY, '1');
    setComplete(true);
  }, []);

  const replay = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setComplete(false);
  }, []);

  const value = useMemo(
    () => ({ ready, complete, position, setPosition, scores, setScore, finish, replay }),
    [ready, complete, position, scores, setScore, finish, replay],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return ctx;
}
