import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { ActionButton, BackHeader, Card, Radio, SafeTop, StickyFooter, Unreachable } from '@/components/kit';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { OUTFIELD_QUESTIONS, POSITIONS, Position, questionsFor } from '@/data/assessment';
import { submitSelfAssessment } from '@/data/api';
import { useCard } from '@/state/card';
import { useI18n } from '@/i18n';

/**
 * P-01 Onboarding, after the number is verified: pick a football identity and
 * answer the anchored assessment (PRO-001, PRO-002).
 *
 * The card this produces is Provisional and says so — §5.1's "CRITICAL
 * DISTINCTION" is that a self-assessment is a starting point, not a claim.
 *
 * Laid out as the redesign's stepped form: one step per screen, a gold bar
 * that counts them, the question in a card and the way on pinned to the foot.
 * The position is step one of the same bar, so the count a player sees at the
 * start is the count they finish on.
 */
export default function Onboarding() {
  const { t, num } = useI18n();
  const router = useRouter();
  const { reload } = useCard();

  const [position, setPosition] = useState<Position | null>(null);
  // Which step is showing, apart from which position is chosen, so stepping
  // back to the position keeps it ticked rather than asking again from blank.
  const [stage, setStage] = useState<'position' | 'questions'>('position');
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

  const pick = (code: Position) => {
    // A different position asks different questions, so the answers given for
    // the old one do not carry over. The same one tapped again keeps them.
    if (code !== position) {
      setPosition(code);
      setIndex(0);
      setAnswers({});
    }
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
      if (__DEV__) console.warn('[onboarding]', e);
      setError(t.errAssessmentUnsaved);
    } finally {
      setBusy(false);
    }
  };

  const onPosition = stage === 'position';
  const steps = questions.length + 1;
  const step = onPosition ? 0 : index + 1;
  const stepDone = (i: number) =>
    i === 0 ? position !== null && !onPosition : answers[questions[i - 1].attribute] !== undefined;

  const back = () => {
    if (onPosition) router.back();
    else if (index > 0) setIndex((i) => i - 1);
    else setStage('position');
  };

  return (
    <View style={{ flex: 1, backgroundColor: void_.bg }}>
      <SafeTop />
      <BackHeader
        title={t.entryOnbTitle}
        subtitle={t.entryOnbStep(num(step + 1), num(steps))}
        onBack={back}
      />

      {/* The bar: gold for a step done, a softer gold for the one showing. */}
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={t.entryOnbStep(num(step + 1), num(steps))}
        style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 20, paddingTop: 12 }}
      >
        {Array.from({ length: steps }, (_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: radius.pill,
              backgroundColor: stepDone(i) ? gold.base : i === step ? goldAlpha.accent : onVoid.edge,
            }}
          />
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 18 }}
        showsVerticalScrollIndicator={false}
      >
        {onPosition ? (
          // Step one: the football identity itself.
          <Card>
            <View style={{ gap: 6 }}>
              <Txt size={20} weight="bold" em={-0.02} lh={1.3} color={onVoid.primary}>
                {t.onbWhereDoYouPlay}
              </Txt>
              <Txt size={13} lh={1.6} color={onVoid.muted}>
                {t.onbPositionBlurb}
              </Txt>
            </View>

            <View style={{ gap: 9 }}>
              {POSITIONS.map((p) => {
                const chosen = position === p.code;
                return (
                  <Choice
                    key={p.code}
                    chosen={chosen}
                    label={`${t[p.label]}. ${t[p.blurb]}`}
                    onPress={() => pick(p.code)}
                  >
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: radius.icon,
                        backgroundColor: chosen ? gold.base : goldAlpha.fill,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Txt size={13} weight="bold" em={0.06} color={chosen ? void_.bg : gold.base}>
                        {p.code}
                      </Txt>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Txt size={15} weight="semibold" color={onVoid.primary}>
                        {t[p.label]}
                      </Txt>
                      <Txt size={11.5} lh={1.4} color={onVoid.faint}>
                        {t[p.blurb]}
                      </Txt>
                    </View>
                  </Choice>
                );
              })}
            </View>
          </Card>
        ) : (
          // Step two onwards: the anchored questions, one at a time.
          <Card>
            <View style={{ gap: 6 }}>
              <Txt size={12} weight="bold" em={0.02} color={gold.base}>
                {t[question.name]}
              </Txt>
              <Txt size={20} weight="bold" em={-0.02} lh={1.35} color={onVoid.primary}>
                {t[question.prompt]}
              </Txt>
            </View>

            <View style={{ gap: 9 }}>
              {question.anchors.map((anchor) => {
                const chosen = answers[question.attribute] === anchor.score;
                return (
                  <Choice
                    key={anchor.label}
                    chosen={chosen}
                    label={t[anchor.label]}
                    onPress={() => choose(question.attribute, anchor.score)}
                  >
                    <Txt size={14} lh={1.4} color={chosen ? onVoid.primary : onVoid.secondary} style={{ flex: 1 }}>
                      {t[anchor.label]}
                    </Txt>
                  </Choice>
                );
              })}
            </View>
          </Card>
        )}

        {!onPosition && !answeredAll ? (
          <Txt size={11.5} lh={1.6} color={onVoid.faint}>
            {t.onbNoRightAnswer}
          </Txt>
        ) : null}

        {error ? <Unreachable label={error} /> : null}
      </ScrollView>

      <StickyFooter>
        {onPosition ? (
          <ActionButton flex label={t.next} disabled={!position} onPress={() => setStage('questions')} />
        ) : answeredAll ? (
          <ActionButton
            flex
            label={busy ? t.buildingCard : t.createMyCard}
            disabled={busy}
            onPress={finish}
            icon={busy ? <ActivityIndicator color={void_.bg} /> : undefined}
          />
        ) : (
          // Answering moves on by itself; this is for coming forward again
          // after stepping back to look at an earlier answer.
          <ActionButton
            flex
            label={t.next}
            disabled={answers[question.attribute] === undefined || index >= questions.length - 1}
            onPress={() => setIndex((i) => Math.min(i + 1, questions.length - 1))}
          />
        )}
      </StickyFooter>
    </View>
  );
}

/** A selectable row: its content, then the radio on the far side. */
function Choice({
  chosen,
  label,
  onPress,
  children,
}: {
  chosen: boolean;
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: chosen }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 52,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: radius.row,
        backgroundColor: chosen ? goldAlpha.fill : void_.inset,
        borderWidth: 1,
        borderColor: chosen ? goldAlpha.accent : pressed ? goldAlpha.edge : onVoid.line,
      })}
    >
      {children}
      <Radio on={chosen} />
    </Pressable>
  );
}
