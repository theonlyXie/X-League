import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { ActionButton, Card, SectionTitle, Unreachable } from '@/components/kit';
import { CheckCircle, ChevronLeft, Clock, Pin } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import {
  refereeFixtures,
  refereeRecord,
  refereeSheet,
  type RefFixture,
  type SheetLine,
} from '@/data/referee';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';
import { useSession } from '@/state/session';

/**
 * One match, as the referee saw it.
 *
 * The score and the sheet are saved together in a single act, because they are
 * one: a score written down and a sheet abandoned halfway is how a cup ends up
 * with a table nobody can explain. The server refuses a sheet that claims more
 * goals than the score, and this screen says the same thing before it asks.
 *
 * A side's scorers may add up to less than its score — an own goal belongs to
 * nobody — so the running total is shown rather than enforced upwards.
 */
export default function RefereeMatch() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const fixtureId = params.id ?? null;
  const { reason, t, num, moment } = useI18n();
  const { signedIn } = useSession();

  const [fixture, setFixture] = useState<RefFixture | null>(null);
  const [lines, setLines] = useState<SheetLine[]>([]);
  const [home, setHome] = useState(0);
  const [away, setAway] = useState(0);
  const [loading, setLoading] = useState(isLive && signedIn);
  const [unreadable, setUnreadable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    // `signedIn` as well as `isLive`, and it used not to be.
    //
    // Both calls below need a session, so reaching this route signed out fired
    // them anyway and PostgREST answered 401 twice. Nothing broke — the catch
    // draws the unreadable state — but two 401s went into the console on every
    // visit, and "could not be read" is the wrong sentence for "you are not
    // signed in". The browser check has been red on main since this route was
    // added, for exactly this.
    if (!isLive || !signedIn || !fixtureId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [all, sheet] = await Promise.all([refereeFixtures(), refereeSheet(fixtureId)]);
      const f = all.find((x) => x.fixtureId === fixtureId) ?? null;
      setFixture(f);
      setLines(sheet);
      setHome(f?.scoreHome ?? 0);
      setAway(f?.scoreAway ?? 0);
      setUnreadable(false);
    } catch {
      setUnreadable(true);
    } finally {
      setLoading(false);
    }
  }, [fixtureId, signedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (playerId: string, field: keyof SheetLine, value: number) =>
    setLines((cur) =>
      cur.map((l) => (l.playerId === playerId ? { ...l, [field]: Math.max(0, value) } : l)),
    );

  const totals = useMemo(() => {
    let h = 0;
    let a = 0;
    for (const l of lines) {
      if (l.side === 'home') h += l.goals;
      else a += l.goals;
    }
    return { h, a };
  }, [lines]);

  const tooMany = totals.h > home || totals.a > away;

  const save = async () => {
    if (!fixtureId || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await refereeRecord(fixtureId, home, away, lines);
      if (res.ok) {
        setSaved(true);
        setNotice(null);
        await load();
      } else {
        setNotice(reason(res.reason) ?? null);
      }
    } catch {
      setNotice(t.offline);
    } finally {
      setSaving(false);
    }
  };

  const sides: ('home' | 'away')[] = ['home', 'away'];

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 40, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/referee'))}
          hitSlop={8}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}
        >
          <ChevronLeft size={22} color={onVoid.primary} />
        </Pressable>
        <Txt size={20} weight="bold" em={-0.02} color={onVoid.primary} style={{ flex: 1 }}>
          {t.refereeTitle}
        </Txt>
      </View>

      {!signedIn ? (
        <Card>
          <Txt size={13} lh={1.5} color={onVoid.muted}>
            {t.signInToSee}
          </Txt>
          <ActionButton label={t.signIn} onPress={() => router.push('/sign-in?next=/referee')} />
        </Card>
      ) : null}

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {signedIn && !loading && unreadable ? <Unreachable label={t.refereeSheetUnreadable} /> : null}

      {/* Reached with an id that resolves to nothing — a fixture that was
          removed, a cup that is not running, or somebody else's match — this
          screen used to render its title and then stop, which reads as a
          broken page rather than an answer. Every other detail route in the
          app says what happened; this one now does too. */}
      {signedIn && !loading && !unreadable && !fixture ? (
        <View style={{ gap: 6 }}>
          <Txt size={14} weight="semibold" color={onVoid.primary}>
            {t.refereeNoSuchMatch}
          </Txt>
          <Txt size={12.5} lh={1.5} color={onVoid.muted}>
            {t.refereeNoSuchMatchBlurb}
          </Txt>
        </View>
      ) : null}

      {fixture ? (
        <>
          <Card>
            <View style={{ gap: 6 }}>
              <Txt size={12} weight="bold" color={gold.base}>
                {fixture.tournamentName}
              </Txt>
              <Txt size={18} weight="bold" em={-0.02} color={onVoid.primary}>
                {fixture.homeName} — {fixture.awayName}
              </Txt>
            </View>
            <View style={{ height: 1, backgroundColor: onVoid.edgeFaint }} />
            {fixture.kicksOffAt ? (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Pin size={15} color={onVoid.dim} />
                  <Txt size={12.5} color={onVoid.secondary} style={{ flex: 1 }}>
                    {fixture.venueName
                      ? fixture.pitchLabel
                        ? t.groundAndPitch(fixture.venueName, fixture.pitchLabel)
                        : fixture.venueName
                      : t.whereTbc}
                  </Txt>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Clock size={15} color={onVoid.dim} />
                  <Txt size={12.5} color={onVoid.secondary} style={{ flex: 1 }}>
                    {moment(fixture.kicksOffAt)}
                  </Txt>
                </View>
              </View>
            ) : (
              <Txt size={12.5} color={onVoid.faint}>
                {t.refereeNotPlaced}
              </Txt>
            )}
          </Card>

          <View style={{ gap: 12 }}>
            <SectionTitle title={t.refereeScore} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Counter label={t.refereeHome} value={home} onChange={setHome} format={num} />
              <Counter label={t.refereeAway} value={away} onChange={setAway} format={num} />
            </View>
          </View>

          <View style={{ gap: 4 }}>
            <SectionTitle title={t.scorersTitle} />
            <Txt size={12} lh={1.5} color={onVoid.faint}>
              {t.refereeSheetBlurb}
            </Txt>
          </View>

          {sides.map((side) => {
            const rows = lines.filter((l) => l.side === side);
            const scored = side === 'home' ? totals.h : totals.a;
            const target = side === 'home' ? home : away;

            return (
              <Card key={side} pad={0} style={{ gap: 0, overflow: 'hidden' }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    backgroundColor: void_.raised,
                  }}
                >
                  <Txt size={14} weight="bold" color={onVoid.primary} style={{ flex: 1 }}>
                    {side === 'home' ? fixture.homeName : fixture.awayName}
                  </Txt>
                  <Txt
                    size={11.5}
                    weight="semibold"
                    color={scored > target ? burgundy.action : scored === target ? gold.base : onVoid.dim}
                  >
                    {scored > target
                      ? // The same sentence the server refuses with, said before
                        // the referee taps save rather than after.
                        reason('More goals on the sheet than in the score.')
                      : scored === target
                        ? t.scorersAllIn
                        : t.scorersLeft(num(target - scored))}
                  </Txt>
                </View>

                {rows.map((l) => (
                  <View
                    key={l.playerId}
                    style={{
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderTopWidth: 1,
                      borderTopColor: onVoid.edgeFaint,
                      gap: 10,
                    }}
                  >
                    <Txt size={13.5} weight="semibold" color={onVoid.primary}>
                      {l.displayName}
                    </Txt>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Tally
                        label={t.refereeGoals}
                        value={l.goals}
                        onChange={(v) => set(l.playerId, 'goals', v)}
                        format={num}
                      />
                      <Tally
                        label={t.refereeAssists}
                        value={l.assists}
                        onChange={(v) => set(l.playerId, 'assists', v)}
                        format={num}
                      />
                      <Tally
                        label={t.refereeFouls}
                        value={l.fouls}
                        onChange={(v) => set(l.playerId, 'fouls', v)}
                        format={num}
                      />
                      <Tally
                        label={t.refereeYellows}
                        value={l.yellows}
                        onChange={(v) => set(l.playerId, 'yellows', v)}
                        format={num}
                        tint={gold.base}
                      />
                      <Tally
                        label={t.refereeReds}
                        value={l.reds}
                        onChange={(v) => set(l.playerId, 'reds', v)}
                        format={num}
                        tint={burgundy.action}
                      />
                    </View>
                  </View>
                ))}
              </Card>
            );
          })}

          {notice ? <Unreachable label={notice} /> : null}

          {saved && !notice ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={18} color={gold.base} filled />
              <Txt size={12.5} weight="semibold" color={gold.base} style={{ flex: 1 }}>
                {t.refereeSaved}
              </Txt>
            </View>
          ) : null}

          <ActionButton
            label={t.refereeSaveSheet}
            disabled={saving || tooMany}
            onPress={() => void save()}
            icon={saving ? <ActivityIndicator color={void_.bg} /> : undefined}
          />
        </>
      ) : null}
    </Screen>
  );
}

/** The score. Big, because it is the thing the whole screen is about. */
function Counter({
  label,
  value,
  onChange,
  format,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  format: (n: number) => string;
}) {
  return (
    <View
      style={{
        flex: 1,
        paddingVertical: 16,
        borderRadius: radius.cardInner,
        borderWidth: 1,
        borderColor: goldAlpha.edge,
        backgroundColor: void_.surface,
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Txt size={13} weight="semibold" color={onVoid.secondary}>
        {label}
      </Txt>
      <Txt size={36} weight="bold" em={-0.03} color={gold.base}>
        {format(value)}
      </Txt>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Step label="−" onPress={() => onChange(Math.max(0, value - 1))} disabled={value === 0} />
        <Step label="+" onPress={() => onChange(Math.min(99, value + 1))} />
      </View>
    </View>
  );
}

/** One column of a player's line: what it is, how many, and the two buttons. */
function Tally({
  label,
  value,
  onChange,
  format,
  tint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  format: (n: number) => string;
  tint?: string;
}) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <Txt size={9.5} weight="bold" em={0.08} upper color={onVoid.dim}>
        {label}
      </Txt>
      <Txt size={17} weight="bold" color={value > 0 ? (tint ?? onVoid.primary) : onVoid.disabled}>
        {format(value)}
      </Txt>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <Step
          label="−"
          small
          onPress={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
        />
        <Step label="+" small onPress={() => onChange(Math.min(99, value + 1))} />
      </View>
    </View>
  );
}

function Step({
  label,
  onPress,
  disabled,
  small,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  small?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? t.oneMore : t.oneFewer}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={{
        width: small ? 26 : 44,
        height: small ? 26 : 38,
        borderRadius: radius.chip,
        backgroundColor: void_.inset,
        borderWidth: 1,
        borderColor: onVoid.edgeFaint,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Txt size={small ? 13 : 18} weight="semibold" color={onVoid.secondary}>
        {label}
      </Txt>
    </Pressable>
  );
}
