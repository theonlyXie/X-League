import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Eyebrow } from '@/components/ui';
import { Reveal } from '@/components/motion';
import { ArrowLeft } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { answerCall, openCalls, type Call, type PositionCode } from '@/data/ready';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';
import { useSession } from '@/state/session';

/**
 * Matches that need somebody, for a player who has said they are free.
 *
 * Every call here already matches: the server filtered by position, by rating
 * and by whether this player is available at all, so nothing on this screen
 * decides who may answer. A list that showed calls it then refused would be
 * the same defect as an empty screen that means "we could not read it".
 *
 * Answering is an offer, not a seat. The copy says so plainly — "the captain
 * will confirm" — because somebody who thinks they have joined a match and
 * turns up to find they have not is the worst outcome this feature can have.
 */
export default function Calls() {
  const router = useRouter();
  const { reason, t, num, money, moment } = useI18n();
  const { signedIn } = useSession();

  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(isLive);
  /** §4.7: a list we could not read is not an empty list. */
  const [unreachable, setUnreachable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [answered, setAnswered] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isLive || !signedIn) {
      setLoading(false);
      return;
    }
    try {
      const rows = await openCalls(30);
      setCalls(rows);
      setUnreachable(false);
    } catch {
      setCalls([]);
      setUnreachable(true);
    } finally {
      setLoading(false);
    }
  }, [signedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  // Calls fill up. Coming back to this screen is the moment its list is most
  // likely to be out of date.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const positionLabel = (code: PositionCode) =>
    code === 'GK' ? t.asPosGk : code === 'DEF' ? t.asPosDef : code === 'MID' ? t.asPosMid : t.asPosFwd;

  async function answer(call: Call) {
    if (busy) return;
    setBusy(call.callId);
    setNotice(null);
    try {
      const res = await answerCall(call.callId);
      if (res.ok) {
        setAnswered((a) => [...a, call.callId]);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setNotice(reason(res.reason) ?? t.offline);
        // A refusal here almost always means it filled while this was on
        // screen, so the honest next move is to redraw the list.
        void load();
      }
    } catch {
      setNotice(t.offline);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen
      contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 16 }}
      refreshControl={
        isLive && signedIn ? (
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={gold.base} colors={[gold.base]} />
        ) : undefined
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))}
          hitSlop={8}
          style={{
            width: 34,
            height: 34,
            borderRadius: radius.icon,
            borderWidth: 1,
            borderColor: onVoid.line,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={16} color={onVoid.secondary} />
        </Pressable>
        <Txt size={20} weight="semibold" color={onVoid.primary}>
          {t.callsTitle}
        </Txt>
      </View>

      {loading && calls.length === 0 ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {!loading && calls.length === 0 ? (
        <View style={{ gap: 6 }}>
          <Txt size={15} weight="semibold" color={onVoid.primary}>
            {unreachable ? t.listUnreachable : t.noCalls}
          </Txt>
          <Txt size={12.5} lh={1.55} color={onVoid.muted}>
            {unreachable ? t.listUnreachableBlurb : t.noCallsBlurb}
          </Txt>
        </View>
      ) : null}

      {notice ? (
        <Txt size={12.5} lh={1.5} color={burgundy.action}>
          {notice}
        </Txt>
      ) : null}

      <View style={{ gap: 10 }}>
        {calls.map((call, i) => {
          const said = answered.includes(call.callId);
          return (
            <Reveal key={call.callId} index={i}>
              <View
                style={{
                  padding: 14,
                  borderRadius: radius.control,
                  borderWidth: 1,
                  borderColor: said ? goldAlpha.frame : onVoid.edgeFaint,
                  backgroundColor: said ? goldAlpha.fill : void_.surface,
                  gap: 10,
                }}
              >
                <View style={{ gap: 3 }}>
                  <Txt size={15} weight="semibold" color={onVoid.primary}>
                    {call.venueName}
                  </Txt>
                  <Txt size={12} color={onVoid.secondary}>
                    {moment(call.kickOff)}
                  </Txt>
                  <Txt size={11.5} color={onVoid.faint}>
                    {[call.area, call.captain ? t.calledBy(call.captain) : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </Txt>
                </View>

                {/* What the captain actually asked for. An empty list of
                    positions means anybody, and saying "anyone" is friendlier
                    than four chips that all look like requirements. */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <Chip label={call.positions.length ? call.positions.map(positionLabel).join(' · ') : t.anyPosition} />
                  {call.minOvr != null ? <Chip label={t.ratingAtLeast(num(call.minOvr))} /> : null}
                  {call.priceEgp != null ? <Chip label={money(call.priceEgp)} /> : null}
                </View>

                {call.note ? (
                  <Txt size={12.5} lh={1.5} color={onVoid.secondary}>
                    {call.note}
                  </Txt>
                ) : null}

                {said ? (
                  <Txt size={12.5} lh={1.5} color={gold.base}>
                    {t.offerSent}
                  </Txt>
                ) : (
                  <Button
                    label={t.illPlay}
                    height={42}
                    disabled={busy === call.callId}
                    onPress={() => void answer(call)}
                  />
                )}
              </View>
            </Reveal>
          );
        })}
      </View>

      {calls.length ? (
        <Txt size={11.5} lh={1.5} color={onVoid.faint}>
          {t.captainConfirms}
        </Txt>
      ) : null}
    </Screen>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View
      style={{
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: goldAlpha.edge,
        backgroundColor: void_.inset,
      }}
    >
      <Txt size={11.5} weight="medium" color={gold.base}>
        {label}
      </Txt>
    </View>
  );
}
