import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Eyebrow } from '@/components/ui';
import { VoidMark } from '@/components/VoidMark';
import { useI18n } from '@/i18n';
import type { I18nKey } from '@/i18n';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { ATTRIBUTES, POSITIONS } from '@/data/onboarding';
import { useProfile } from '@/state/profile';

/**
 * P-01 Onboarding and self-assessment — a new identity before the first hold.
 */
export default function Onboarding() {
  const router = useRouter();
  const { t } = useI18n();
  const { profile, setPosition, setScore, finishOnboarding } = useProfile();
  const [step, setStep] = useState(0);

  const advance = async () => {
    if (step < 3) {
      setStep((s) => s + 1);
      return;
    }
    await finishOnboarding();
    router.replace('/');
  };

  return (
    <Screen contentStyle={{ paddingTop: 18, paddingHorizontal: 22, paddingBottom: 36, gap: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <VoidMark size={28} rings={1} />
        <Txt size={11} weight="semibold" em={0.16} color={gold.base}>
          {step + 1} / 4
        </Txt>
      </View>

      {step === 0 ? <Welcome /> : null}
      {step === 1 ? <PositionStep position={profile.position} onPick={setPosition} /> : null}
      {step === 2 ? <AssessStep scores={profile.scores} onChange={setScore} /> : null}
      {step === 3 ? <DoneStep position={profile.position} /> : null}

      <View style={{ flex: 1, minHeight: 12 }} />
      <Button
        label={step === 3 ? t('onboarding.findPitch') : t('common.continue')}
        onPress={advance}
      />
      {step === 0 ? (
        <Button
          label={t('onboarding.haveCard')}
          variant="ghost"
          onPress={async () => {
            await finishOnboarding();
            router.replace('/');
          }}
        />
      ) : null}
    </Screen>
  );
}

function Welcome() {
  const { t } = useI18n();
  return (
    <View style={{ gap: 16, paddingTop: 12 }}>
      <Eyebrow color={gold.base}>{t('onboarding.welcomeKicker')}</Eyebrow>
      <Txt size={28} weight="bold" em={-0.03} lh={1.15} color={onVoid.primary}>
        {t('onboarding.welcomeTitle')}
      </Txt>
      <Txt size={14.5} lh={1.5} color={onVoid.secondary}>
        {t('onboarding.welcomeBody')}
      </Txt>
    </View>
  );
}

function PositionStep({ position, onPick }: { position: string; onPick: (p: (typeof POSITIONS)[number]) => void }) {
  const { t } = useI18n();
  return (
    <View style={{ gap: 16, paddingTop: 8 }}>
      <Txt size={24} weight="bold" em={-0.02} color={onVoid.primary}>
        {t('onboarding.positionTitle')}
      </Txt>
      <Txt size={14} lh={1.5} color={onVoid.secondary}>
        {t('onboarding.positionBody')}
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {POSITIONS.map((p) => {
          const on = p === position;
          const labelKey = `onboarding.positions.${p}` as I18nKey;
          return (
            <Pressable
              key={p}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t(labelKey)}
              onPress={() => onPick(p)}
              style={{
                width: '47%',
                height: 56,
                borderRadius: radius.control,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                ...(on
                  ? { backgroundColor: goldAlpha.fill, borderWidth: 1, borderColor: goldAlpha.accent }
                  : { borderWidth: 1, borderColor: onVoid.hairline }),
              }}
            >
              <Txt size={16} weight="bold" color={on ? gold.base : onVoid.primary}>
                {p}
              </Txt>
              <Txt size={10} color={on ? gold.base : onVoid.dim}>
                {t(labelKey)}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function AssessStep({
  scores,
  onChange,
}: {
  scores: Record<(typeof ATTRIBUTES)[number]['key'], number>;
  onChange: (key: (typeof ATTRIBUTES)[number]['key'], value: number) => void;
}) {
  const { t } = useI18n();
  return (
    <View style={{ gap: 16, paddingTop: 8 }}>
      <Txt size={24} weight="bold" em={-0.02} color={onVoid.primary}>
        {t('onboarding.assessTitle')}
      </Txt>
      <Txt size={14} lh={1.5} color={onVoid.secondary}>
        {t('onboarding.assessBody')}
      </Txt>
      <View style={{ gap: 14 }}>
        {ATTRIBUTES.map((attr) => {
          const labelKey = `onboarding.attrs.${attr.key}` as I18nKey;
          return (
            <View key={attr.key} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt size={13} weight="semibold" color={onVoid.primary}>
                  {t(labelKey)}
                </Txt>
                <Txt size={13} weight="bold" color={gold.base}>
                  {scores[attr.key]}
                </Txt>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[50, 60, 70, 80, 90].map((n) => {
                  const on = scores[attr.key] === n;
                  return (
                    <Pressable
                      key={n}
                      accessibilityRole="button"
                      accessibilityLabel={`${t(labelKey)} ${n}`}
                      onPress={() => onChange(attr.key, n)}
                      style={{
                        flex: 1,
                        height: 36,
                        borderRadius: radius.chip,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: on ? gold.base : void_.surface,
                        borderWidth: 1,
                        borderColor: on ? gold.base : onVoid.edge,
                      }}
                    >
                      <Txt size={11} weight="semibold" color={on ? void_.bg : onVoid.muted}>
                        {n}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function DoneStep({ position }: { position: string }) {
  const { t } = useI18n();
  const posKey = `onboarding.positions.${position}` as I18nKey;
  return (
    <View style={{ gap: 16, paddingTop: 12 }}>
      <Eyebrow color={gold.base}>
        {t(posKey)} · {position}
      </Eyebrow>
      <Txt size={28} weight="bold" em={-0.03} color={onVoid.primary}>
        {t('onboarding.doneTitle')}
      </Txt>
      <Txt size={14.5} lh={1.5} color={onVoid.secondary}>
        {t('onboarding.doneBody')}
      </Txt>
    </View>
  );
}
