import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Eyebrow } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
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
          {t.refereeTitle}
        </Txt>
      </View>

      <Txt size={13} lh={1.5} color={onVoid.muted}>
        {t.refereeBlurb}
      </Txt>

      {loading ? <ActivityIndicator color={gold.base} /> : null}

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

      <View style={{ gap: 10 }}>
        {fixtures.map((f) => {
          const placed = !!f.kicksOffAt;
          const future = placed && new Date(f.kicksOffAt as string) > new Date();

          return (
            <Pressable
              key={f.fixtureId}
              accessibilityRole="button"
              accessibilityLabel={`${f.homeName} v ${f.awayName}`}
              onPress={() => router.push(`/referee/${f.fixtureId}`)}
              style={({ pressed }) => ({
                padding: 14,
                borderRadius: radius.card,
                backgroundColor: void_.surface,
                borderWidth: 1,
                borderColor: f.recorded
                  ? goldAlpha.edgeSoft
                  : pressed
                    ? goldAlpha.edge
                    : onVoid.edgeFaint,
                gap: 8,
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Eyebrow>{f.tournamentName}</Eyebrow>
                <Txt size={10.5} color={onVoid.dim}>
                  {t.refereeRound(num(f.round))}
                </Txt>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Txt size={15} weight="semibold" color={onVoid.primary} style={{ flex: 1 }}>
                  {f.homeName}
                </Txt>
                <Txt size={15} weight="bold" color={f.recorded ? gold.base : onVoid.dim}>
                  {f.scoreHome != null && f.scoreAway != null
                    ? `${num(f.scoreHome)} – ${num(f.scoreAway)}`
                    : 'v'}
                </Txt>
                <Txt
                  size={15}
                  weight="semibold"
                  color={onVoid.primary}
                  style={{ flex: 1, textAlign: 'right' }}
                >
                  {f.awayName}
                </Txt>
              </View>

              <Txt size={11.5} color={onVoid.faint}>
                {!placed
                  ? t.refereeNotPlaced
                  : f.recorded
                    ? t.refereeRecorded
                    : future
                      ? t.refereeNotYet
                      : t.refereeRecordMatch}
                {placed && f.venueName
                  ? ` · ${f.pitchLabel ? t.groundAndPitch(f.venueName, f.pitchLabel) : f.venueName}`
                  : ''}
                {placed ? ` · ${moment(f.kicksOffAt as string)}` : ''}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}
