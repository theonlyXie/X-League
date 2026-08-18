import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Eyebrow } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { OUTFIELD_QUESTIONS, POSITIONS, Position, questionsFor } from '@/data/assessment';
import { submitSelfAssessment } from '@/data/api';
import { useCard } from '@/state/card';

/**
 * P-01 Onboarding, after the number is verified: pick a football identity and
 * answer the anchored assessment (PRO-001, PRO-002).
 *
 * The card this produces is Provisional and says so — §5.1's "CRITICAL
 * DISTINCTION" is that a self-assessment is a starting point, not a claim.
 */
export default function Onboarding() {
  const router = useRouter();
  const { reload } = useCard();

  const [position, setPosition] = useState<Position | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const questions = position ? questionsFor(position) : OUTFIELD_QUESTIONS;
  const question = questions[index];
  const answeredAll = position !== null && questions.every((q) => answers[q.attribute] !== undefined);

  const choose = (attribute: string, score: number) => {
    setAnswers((a) => ({ ...a, [attribute]: score }));
    if (index < questions.length - 1) setIndex((i) => i + 1);
  };

  const finish = async () => {
    if (!position) return;
    setBusy(true);
    setError(null);
    try {
      await submitSelfAssessment(position, answers);
      await reload();
      router.replace('/me');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your assessment.');
    } finally {
      setBusy(false);
    }
  };

  // Step one: the football identity itself.
  if (!position) {
    return (
      <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 24 }}>
        <Header onBack={() => router.back()} />
        <View style={{ gap: 8 }}>
          <Txt size={26} weight="bold" em={-0.02} color={onVoid.primary}>
            Where do you play?
          </Txt>
          <Txt size={13} lh={1.6} color={onVoid.muted}>
            Your position decides which attributes carry your rating. You can
            change it later, but it takes a new assessment.
          </Txt>
        </View>

        <View style={{ gap: 10 }}>
          {POSITIONS.map((p) => (
            <Pressable
              key={p.code}
              accessibilityRole="radio"
              accessibilityState={{ selected: false }}
              accessibilityLabel={`${p.label}. ${p.blurb}`}
              onPress={() => {
                setPosition(p.code);
                setIndex(0);
                setAnswers({});
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                padding: 16,
                borderRadius: radius.control,
                backgroundColor: void_.surface,
                borderWidth: 1,
                borderColor: pressed ? goldAlpha.accent : onVoid.edgeFaint,
              })}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radius.chip,
                  backgroundColor: void_.inset,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Txt size={13} weight="bold" em={0.06} color={gold.base}>
                  {p.code}
                </Txt>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Txt size={15} weight="semibold" color={onVoid.primary}>
                  {p.label}
                </Txt>
                <Txt size={11.5} lh={1.4} color={onVoid.faint}>
                  {p.blurb}
                </Txt>
              </View>
            </Pressable>
          ))}
        </View>
      </Screen>
    );
  }

  // Step two: the anchored questions, one at a time.
  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 22 }}>
      <Header
        onBack={() => {
          if (index > 0) setIndex((i) => i - 1);
          else setPosition(null);
        }}
      />

      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Eyebrow>{question.name}</Eyebrow>
          <Txt size={11.5} color={onVoid.faint}>
            {index + 1} of {questions.length}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {questions.map((q, i) => (
            <View
              key={q.attribute}
              style={{
                flex: 1,
                height: 3,
                borderRadius: radius.pill,
                backgroundColor:
                  answers[q.attribute] !== undefined
                    ? gold.base
                    : i === index
                      ? 'rgba(198,163,75,.4)'
                      : 'rgba(243,238,229,.1)',
              }}
            />
          ))}
        </View>
      </View>

      <Txt size={20} weight="bold" em={-0.02} lh={1.35} color={onVoid.primary}>
        {question.prompt}
      </Txt>

      <View style={{ gap: 9 }}>
        {question.anchors.map((anchor) => {
          const chosen = answers[question.attribute] === anchor.score;
          return (
            <Pressable
              key={anchor.label}
              accessibilityRole="radio"
              accessibilityState={{ selected: chosen }}
              accessibilityLabel={anchor.label}
              onPress={() => choose(question.attribute, anchor.score)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 15,
                paddingHorizontal: 16,
                borderRadius: radius.control,
                backgroundColor: chosen ? 'rgba(198,163,75,.1)' : void_.surface,
                borderWidth: 1,
                borderColor: chosen ? gold.base : pressed ? goldAlpha.edge : onVoid.edgeFaint,
              })}
            >
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: radius.pill,
                  borderWidth: chosen ? 2 : 1,
                  borderColor: chosen ? gold.base : 'rgba(243,238,229,.25)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {chosen ? (
                  <View style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: gold.base }} />
                ) : null}
              </View>
              <Txt size={14} lh={1.4} color={chosen ? onVoid.primary : onVoid.secondary} style={{ flex: 1 }}>
                {anchor.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <View
          accessibilityRole="alert"
          style={{
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: radius.chip,
            borderWidth: 1,
            borderColor: 'rgba(101,21,37,.5)',
            backgroundColor: 'rgba(101,21,37,.09)',
          }}
        >
          <Txt size={12.5} color={burgundy.action}>
            {error}
          </Txt>
        </View>
      ) : null}

      {answeredAll ? (
        <Button
          label={busy ? 'Building your card…' : 'Create my card'}
          height={52}
          round={radius.control}
          size={15}
          disabled={busy}
          onPress={finish}
        />
      ) : (
        <Txt size={11.5} lh={1.6} color="rgba(243,238,229,.38)">
          There is no right answer here. The card you get is provisional — it
          only becomes yours properly once verified matches back it up.
        </Txt>
      )}
    </Screen>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={10}
        onPress={onBack}
        style={{
          width: 34,
          height: 34,
          borderRadius: radius.icon,
          borderWidth: 1,
          borderColor: 'rgba(243,238,229,.14)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ArrowLeft size={16} color={onVoid.secondary} />
      </Pressable>
    </View>
  );
}
