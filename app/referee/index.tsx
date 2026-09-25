import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { CheckCircle, ChevronLeft, ChevronRight, Clock, Pin, Whistle } from '@/components/icons';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { refereeFixtures, type RefFixture } from '@/data/referee';
import { useI18n } from '@/i18n';
import { useRefreshTick } from '@/state/refresh';
import { isLive } from '@/lib/supabase';
import { useSession } from '@/state/session';

/**
 * The cup matches this referee can record.
 *
 * Every fixture in a live cup, newest first, rather than a list somebody
 * assigned: X League appoints its referees by making the account at all, and a
 * referee standing on a pitch should not find the match missing because nobody
 * remembered to tick a box.
 *
 * A match with no ground and no hour is here, and says so. That is a real state
 * — the organiser has not placed it yet — and a referee needs to be able to see
 * it rather than wonder why the match is not in the list.
 */
export default function RefereeList() {
  const router = useRouter();
  const { isReferee } = useSession();
  const { t, num, moment } = useI18n();

  const tick = useRefreshTick();
  const [fixtures, setFixtures] = useState<RefFixture[]>([]);
  const [loading, setLoading] = useState(isLive);
  /** §4.7: a list we could not read is not an empty list. */
  const [unreachable, setUnreachable] = useState(false);

  const load = useCallback(async () => {
    if (!isLive || !isReferee) {
      setLoading(false);
      setFixtures([]);
      return;
    }
    setLoading(true);
    try {
      setFixtures(await refereeFixtures());
      setUnreachable(false);
    } catch {
      setFixtures([]);
      setUnreachable(true);
    } finally {
      setLoading(false);
    }
  }, [isReferee]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}>
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
        <View style={{ gap: 2, flex: 1 }}>
          <Txt size={20} weight="bold" em={-0.02} color={onVoid.primary}>
            {t.refereeTitle}
          </Txt>
          <Txt size={11.5} lh={1.5} color={onVoid.faint}>
            {t.refereeBlurb}
          </Txt>
        </View>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {!loading && unreachable ? (
        <View style={{ gap: 6 }}>
          <Txt size={15} weight="semibold" color={onVoid.primary}>
            {t.listUnreachable}
          </Txt>
          <Txt size={12.5} lh={1.55} color={onVoid.muted}>
            {t.listUnreachableBlurb}
          </Txt>
        </View>
      ) : null}

      {!loading && !unreachable && fixtures.length === 0 ? (
        <View style={{ gap: 6 }}>
          <Txt size={15} weight="semibold" color={onVoid.primary}>
            {t.refereeNoMatches}
          </Txt>
          <Txt size={12.5} lh={1.55} color={onVoid.muted}>
            {t.refereeNoMatchesBlurb}
          </Txt>
        </View>
      ) : null}

      <View style={{ gap: 12 }}>
        {fixtures.map((f) => {
          const placed = !!f.kicksOffAt;
          const future = placed && new Date(f.kicksOffAt as string) > new Date();
          const state = !placed
            ? t.refereeNotPlaced
            : f.recorded
              ? t.refereeRecorded
              : future
                ? t.refereeNotYet
                : t.refereeRecordMatch;
          // The one a referee is here for: played, not yet written down.
          const due = placed && !future && !f.recorded;

          return (
            <Pressable
              key={f.fixtureId}
              accessibilityRole="button"
              accessibilityLabel={`${f.homeName} v ${f.awayName}`}
              onPress={() => router.push(`/referee/${f.fixtureId}`)}
              style={({ pressed }) => ({
                borderRadius: radius.cardInner,
                backgroundColor: pressed ? void_.raised : void_.surface,
                borderWidth: 1,
                borderColor: f.recorded ? goldAlpha.edgeSoft : pressed ? goldAlpha.edge : onVoid.edge,
                overflow: 'hidden',
              })}
            >
              <View style={{ padding: 14, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Txt size={12} weight="bold" color={gold.base} numberOfLines={1} style={{ flexShrink: 1 }}>
                    {f.tournamentName}
                  </Txt>
                  <Txt size={11} color={onVoid.dim}>
                    {t.refereeRound(num(f.round))}
                  </Txt>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Txt size={15} weight="semibold" color={onVoid.primary} style={{ flex: 1 }}>
                    {f.homeName}
                  </Txt>
                  <View
                    style={{
                      minWidth: 58,
                      paddingVertical: 5,
                      paddingHorizontal: 10,
                      borderRadius: radius.dense,
                      alignItems: 'center',
                      backgroundColor: f.recorded ? goldAlpha.fill : void_.inset,
                    }}
                  >
                    <Txt size={15} weight="bold" color={f.recorded ? gold.base : onVoid.dim}>
                      {f.scoreHome != null && f.scoreAway != null
                        ? `${num(f.scoreHome)} – ${num(f.scoreAway)}`
                        : 'v'}
                    </Txt>
                  </View>
                  <Txt
                    size={15}
                    weight="semibold"
                    color={onVoid.primary}
                    style={{ flex: 1, textAlign: 'right' }}
                  >
                    {f.awayName}
                  </Txt>
                </View>

                {placed ? (
                  <View style={{ gap: 6 }}>
                    {f.venueName ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                        <Pin size={14} color={onVoid.dim} />
                        <Txt size={11.5} color={onVoid.faint} numberOfLines={1} style={{ flex: 1 }}>
                          {f.pitchLabel ? t.groundAndPitch(f.venueName, f.pitchLabel) : f.venueName}
                        </Txt>
                      </View>
                    ) : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      <Clock size={14} color={onVoid.dim} />
                      <Txt size={11.5} color={onVoid.faint} numberOfLines={1} style={{ flex: 1 }}>
                        {moment(f.kicksOffAt as string)}
                      </Txt>
                    </View>
                  </View>
                ) : null}
              </View>

              {/* What happens next with this match, as the card's foot. */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 11,
                  paddingHorizontal: 14,
                  borderTopWidth: 1,
                  borderTopColor: onVoid.edgeFaint,
                }}
              >
                {f.recorded ? <CheckCircle size={16} color={gold.base} filled /> : <Whistle size={16} color={due ? gold.base : onVoid.dim} />}
                <Txt
                  size={12.5}
                  weight="semibold"
                  color={f.recorded || due ? gold.base : onVoid.muted}
                  style={{ flex: 1 }}
                >
                  {state}
                </Txt>
                <ChevronRight size={16} color={onVoid.dim} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}
