import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { ActionButton, PitchArt } from '@/components/kit';
import { Reveal } from '@/components/motion';
import { CheckCircle, ChevronLeft, Clock } from '@/components/icons';
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))}
          hitSlop={8}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}
        >
          <ChevronLeft size={22} color={onVoid.primary} />
        </Pressable>
        <Txt size={20} weight="bold" em={-0.02} color={onVoid.primary} style={{ flex: 1 }}>
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

      <View style={{ gap: 12 }}>
        {calls.map((call, i) => {
          const said = answered.includes(call.callId);
          return (
            <Reveal key={call.callId} index={i}>
              {/* The search results' row: the pitch on one side, the facts on
                  the other, and the answer under both. A call carries no
                  photograph, so the drawn pitch stands in. */}
              <View
                style={{
                  padding: 10,
                  borderRadius: radius.cardInner,
                  borderWidth: 1,
                  borderColor: said ? goldAlpha.frame : onVoid.edgeFaint,
                  backgroundColor: said ? goldAlpha.fillSoft : void_.surface,
                  gap: 12,
                }}
              >
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ width: 96 }}>
                    <PitchArt height={96} round={radius.row} />
                  </View>
                  <View style={{ flex: 1, gap: 4, paddingVertical: 2 }}>
                    <Txt size={15} weight="bold" color={onVoid.primary} numberOfLines={1}>
                      {call.venueName}
                    </Txt>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Clock size={13} color={gold.base} />
                      <Txt size={12} weight="semibold" color={onVoid.secondary} style={{ flexShrink: 1 }}>
                        {moment(call.kickOff)}
                      </Txt>
                    </View>
                    <Txt size={11.5} color={onVoid.faint} numberOfLines={1}>
                      {[call.area, call.captain ? t.calledBy(call.captain) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Txt>
                    <View style={{ flex: 1 }} />
                    {call.priceEgp != null ? (
                      <Txt size={12.5} weight="bold" color={onVoid.primary}>
                        {money(call.priceEgp)}
                      </Txt>
                    ) : null}
                  </View>
                </View>

                {/* What the captain actually asked for. An empty list of
                    positions means anybody, and saying "anyone" is friendlier
                    than four chips that all look like requirements. */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 2 }}>
                  <Chip label={call.positions.length ? call.positions.map(positionLabel).join(' · ') : t.anyPosition} />
                  {call.minOvr != null ? <Chip label={t.ratingAtLeast(num(call.minOvr))} /> : null}
                </View>

                {call.note ? (
                  <Txt size={12.5} lh={1.5} color={onVoid.secondary} style={{ paddingHorizontal: 2 }}>
                    {call.note}
                  </Txt>
                ) : null}

                {said ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2, paddingBottom: 2 }}>
                    <CheckCircle size={16} color={gold.base} />
                    <Txt size={12.5} lh={1.5} color={gold.base} style={{ flex: 1 }}>
                      {t.offerSent}
                    </Txt>
                  </View>
                ) : (
                  <ActionButton
                    label={t.illPlay}
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
        backgroundColor: goldAlpha.fillSoft,
      }}
    >
      <Txt size={11.5} weight="medium" color={gold.base}>
        {label}
      </Txt>
    </View>
  );
}
