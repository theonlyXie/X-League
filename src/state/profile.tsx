import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ATTRIBUTES, POSITIONS, Position } from '@/data/onboarding';
import { attributesFromScores, confidenceLabel, ovrFromScores, selfAssessedPct } from '@/lib/cardMath';
import { loadJson, saveJson } from '@/lib/storage';

const STORAGE_KEY = 'xleague.profile.v1';

export type SelfScores = Record<(typeof ATTRIBUTES)[number]['key'], number>;

export type Profile = {
  firstName: string;
  position: Position;
  scores: SelfScores;
  onboarded: boolean;
  verifiedMatches: number;
};

const DEFAULT_SCORES: SelfScores = { SPD: 70, SHO: 70, PAS: 70, DRI: 70, DEF: 70, PHY: 70 };

const DEFAULT_PROFILE: Profile = {
  firstName: 'Basel',
  position: POSITIONS[2],
  scores: DEFAULT_SCORES,
  onboarded: false,
  verifiedMatches: 18,
};

type ProfileContextValue = {
  ready: boolean;
  profile: Profile;
  setPosition: (p: Position) => void;
  setScore: (key: keyof SelfScores, value: number) => void;
  finishOnboarding: () => Promise<void>;
  replayOnboarding: () => Promise<void>;
  card: {
    name: string;
    initials: string;
    ovr: number;
    position: Position;
    confidence: ReturnType<typeof confidenceLabel>;
    attributes: { key: string; value: number }[];
    selfAssessedPct: number;
    explained: 'PAS';
  };
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);

  useEffect(() => {
    loadJson<Profile>(STORAGE_KEY, DEFAULT_PROFILE).then((p) => {
      setProfile(p);
      setReady(true);
    });
  }, []);

  const persist = useCallback((updater: (prev: Profile) => Profile) => {
    setProfile((prev) => {
      const next = updater(prev);
      void saveJson(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const setPosition = useCallback((position: Position) => persist((p) => ({ ...p, position })), [persist]);
  const setScore = useCallback(
    (key: keyof SelfScores, value: number) => persist((p) => ({ ...p, scores: { ...p.scores, [key]: value } })),
    [persist],
  );
  const finishOnboarding = useCallback(async () => {
    persist((p) => ({ ...p, onboarded: true, verifiedMatches: 0 }));
  }, [persist]);
  const replayOnboarding = useCallback(async () => {
    persist((p) => ({ ...p, onboarded: false, verifiedMatches: 0 }));
  }, [persist]);

  const card = useMemo(() => {
    const ovr = ovrFromScores(profile.scores, profile.position);
    const initials = profile.firstName.slice(0, 2).toUpperCase();
    return {
      name: `${profile.firstName.toUpperCase()} E.`,
      initials,
      ovr,
      position: profile.position,
      confidence: confidenceLabel(profile.verifiedMatches),
      attributes: attributesFromScores(profile.scores),
      selfAssessedPct: selfAssessedPct(profile.verifiedMatches),
      explained: 'PAS' as const,
    };
  }, [profile]);

  const value = useMemo(
    () => ({ ready, profile, setPosition, setScore, finishOnboarding, replayOnboarding, card }),
    [ready, profile, setPosition, setScore, finishOnboarding, replayOnboarding, card],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside ProfileProvider');
  return ctx;
}
