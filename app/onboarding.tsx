import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Eyebrow } from '@/components/ui';
import { VoidMark } from '@/components/VoidMark';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { ATTRIBUTES, ONBOARDING_COPY, POSITIONS } from '@/data/onboarding';
import { useOnboarding } from '@/state/onboarding';

/**
 * P-01 Onboarding and self-assessment — a new identity before the first hold.
 */
export default function Onboarding() {
  const router = useRouter();
  const { position, setPosition, scores, setScore, finish } = useOnboarding();
  const [step, setStep] = useState(0);

  const advance = async () => {
    if (step < 3) {
      setStep((s) => s + 1);
      return;
    }
    await finish();
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
      {step === 1 ? (
        <PositionStep position={position} onPick={setPosition} />
      ) : null}
      {step === 2 ? <AssessStep scores={scores} onChange={setScore} /> : null}
      {step === 3 ? <DoneStep position={position} /> : null}

      <View style={{ flex: 1, minHeight: 12 }} />
      <Button label={step === 3 ? 'Find a pitch' : 'Continue'} onPress={advance} />
      {step === 0 ? (
        <Button
          label="I already have a card"
          variant="ghost"
          onPress={async () => {
            await finish();
            router.replace('/');
          }}
        />
      ) : null}
    </Screen>
  );
}

function Welcome() {
  return (
    <View style={{ gap: 16, paddingTop: 12 }}>
      <Eyebrow color={gold.base}>{ONBOARDING_COPY.welcomeKicker}</Eyebrow>
      <Txt size={28} weight="bold" em={-0.03} lh={1.15} color={onVoid.primary}>
        {ONBOARDING_COPY.welcomeTitle}
      </Txt>
      <Txt size={14.5} lh={1.5} color={onVoid.secondary}>
        {ONBOARDING_COPY.welcomeBody}
      </Txt>
    </View>
  );
}

function PositionStep({ position, onPick }: { position: string; onPick: (p: (typeof POSITIONS)[number]) => void }) {
  return (
    <View style={{ gap: 16, paddingTop: 8 }}>
      <Txt size={24} weight="bold" em={-0.02} color={onVoid.primary}>
        {ONBOARDING_COPY.positionTitle}
      </Txt>
      <Txt size={14} lh={1.5} color={onVoid.secondary}>
        {ONBOARDING_COPY.positionBody}
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {POSITIONS.map((p) => {
          const on = p === position;
          return (
            <Pressable
              key={p}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={p}
              onPress={() => onPick(p)}
              style={{
                width: '47%',
                height: 56,
                borderRadius: radius.control,
                alignItems: 'center',
                justifyContent: 'center',
                ...(on
                  ? { backgroundColor: goldAlpha.fill, borderWidth: 1, borderColor: goldAlpha.accent }
                  : { borderWidth: 1, borderColor: onVoid.hairline }),
              }}
            >
              <Txt size={16} weight="bold" color={on ? gold.base : onVoid.primary}>
                {p}
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
  return (
    <View style={{ gap: 16, paddingTop: 8 }}>
      <Txt size={24} weight="bold" em={-0.02} color={onVoid.primary}>
        {ONBOARDING_COPY.assessTitle}
      </Txt>
      <Txt size={14} lh={1.5} color={onVoid.secondary}>
        {ONBOARDING_COPY.assessBody}
      </Txt>
      <View style={{ gap: 14 }}>
        {ATTRIBUTES.map((attr) => (
          <View key={attr.key} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Txt size={13} weight="semibold" color={onVoid.primary}>
                {attr.label}
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
                    accessibilityLabel={`${attr.label} ${n}`}
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
        ))}
      </View>
    </View>
  );
}

function DoneStep({ position }: { position: string }) {
  return (
    <View style={{ gap: 16, paddingTop: 12 }}>
      <Eyebrow color={gold.base}>{position} · self-assessed</Eyebrow>
      <Txt size={28} weight="bold" em={-0.03} color={onVoid.primary}>
        {ONBOARDING_COPY.doneTitle}
      </Txt>
      <Txt size={14.5} lh={1.5} color={onVoid.secondary}>
        {ONBOARDING_COPY.doneBody}
      </Txt>
    </View>
  );
}
