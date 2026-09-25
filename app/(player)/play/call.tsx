import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { TextInput } from '@/components/TextField';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Divider, Eyebrow } from '@/components/ui';
import { Avatar } from '@/components/Avatar';
import { PressScale } from '@/components/motion';
import { ChevronLeft, Megaphone } from '@/components/icons';
import { ActionButton, Card } from '@/components/kit';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import {
  acceptOffer,
  callOffers,
  closeCall,
  declineOffer,
  myCall,
  openCall,
  POSITIONS,
  type MyCall,
  type Offer,
  type PositionCode,
} from '@/data/ready';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';

/**
 * Calling for players, and deciding who gets the shirt.
 *
 * One screen rather than two, because they are one job done in two sittings —
 * ask on Tuesday, choose on Thursday — and a captain coming back to see who
 * answered should not have to remember which of two screens they used.
 *
 * The positions are chips and nothing is required. Most captains are short of
 * a body rather than short of a left back, so selecting nothing is the normal
 * case and means anybody. A rating floor is behind "advanced" because asking
 * for it first would make the common case feel like a form.
 *
 * What the floor does not do is exclude a player who has no card yet. That is
 * the server's rule, and the note under the field says so, because a captain
 * who sets 70 and then sees an unrated player answer would otherwise think it
 * was broken.
 */
export default function CallForPlayers() {
  const router = useRouter();
  const params = useLocalSearchParams<{ booking?: string }>();
  const bookingId = params.booking ?? null;
  const { reason, t, num } = useI18n();

  const [call, setCall] = useState<MyCall | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(isLive);
  const [picked, setPicked] = useState<PositionCode[]>([]);
  const [minOvr, setMinOvr] = useState('');
  const [note, setNote] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isLive || !bookingId) {
      setLoading(false);
      return;
    }
    try {
      const [mine, waiting] = await Promise.all([myCall(bookingId), callOffers(bookingId)]);
      setCall(mine);
      setOffers(waiting);
      if (mine) {
        setPicked(mine.positions);
        setMinOvr(mine.minOvr != null ? String(mine.minOvr) : '');
        setNote(mine.note ?? '');
        if (mine.minOvr != null) setAdvanced(true);
      }
    } catch {
      setNotice(t.offline);
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const label = (code: PositionCode) =>
    code === 'GK' ? t.asPosGk : code === 'DEF' ? t.asPosDef : code === 'MID' ? t.asPosMid : t.asPosFwd;

  const toggle = (code: PositionCode) => {
    void Haptics.selectionAsync();
    setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]));
  };

  async function publish() {
    if (!bookingId || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const floor = minOvr.trim() ? Number(minOvr.trim()) : null;
      if (floor != null && (!Number.isFinite(floor) || floor < 1 || floor > 99)) {
        setNotice(t.ratingRange);
        return;
      }
      const res = await openCall(bookingId, {
        positions: picked,
        minOvr: floor,
        note: note.trim() || undefined,
      });
      if (res.ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await load();
      } else {
        setNotice(reason(res.reason) ?? t.offline);
      }
    } catch {
      setNotice(t.offline);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!bookingId || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await closeCall(bookingId);
      if (!res.ok) setNotice(reason(res.reason) ?? t.offline);
      else {
        setCall(null);
        setOffers([]);
      }
    } catch {
      setNotice(t.offline);
    } finally {
      setBusy(false);
    }
  }

  async function settle(offer: Offer, take: boolean) {
    if (acting) return;
    setActing(offer.responseId);
    setNotice(null);
    try {
      const res = take ? await acceptOffer(offer.responseId) : await declineOffer(offer.responseId);
      if (!res.ok) setNotice(reason(res.reason) ?? t.offline);
      else void Haptics.selectionAsync();
      await load();
    } catch {
      setNotice(t.offline);
    } finally {
      setActing(null);
    }
  }

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/play'))}
          hitSlop={8}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}
        >
          <ChevronLeft size={22} color={onVoid.primary} />
        </Pressable>
        <Megaphone size={20} color={gold.base} />
        <Txt size={20} weight="bold" em={-0.02} color={onVoid.primary}>
          {t.callForPlayers}
        </Txt>
      </View>

      {loading ? <ActivityIndicator color={gold.base} /> : null}

      {/* Whoever answered comes first once anybody has. The captain opened this
          screen to write a call the first time and to read the answers every
          time after. */}
      {offers.length ? (
        <View style={{ gap: 10 }}>
          <Eyebrow>{t.whoAnswered}</Eyebrow>
          {offers.map((offer) => (
            <View
              key={offer.responseId}
              style={{
                padding: 12,
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: goldAlpha.edge,
                backgroundColor: void_.surface,
                gap: 10,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar
                  name={offer.displayName}
                  url={offer.photoUrl}
                  size={40}
                  background={void_.raised}
                  border={onVoid.edge}
                  color={onVoid.secondary}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt size={14} weight="semibold" color={onVoid.primary}>
                    {offer.displayName}
                  </Txt>
                  <Txt size={11.5} color={onVoid.faint}>
                    {[offer.position ? label(offer.position) : t.noPositionSet, offer.area]
                      .filter(Boolean)
                      .join(' · ')}
                  </Txt>
                </View>
                {offer.ovr != null ? (
                  <Txt size={15} weight="bold" color={gold.base}>
                    {num(offer.ovr)}
                  </Txt>
                ) : (
                  <Txt size={11.5} color={onVoid.dim}>
                    {t.noCardYet}
                  </Txt>
                )}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  label={t.addToSquad}
                  flex={1}
                  height={40}
                  size={13}
                  disabled={acting === offer.responseId}
                  onPress={() => void settle(offer, true)}
                />
                <Button
                  label={t.notThisTime}
                  variant="ghost"
                  flex={1}
                  height={40}
                  size={13}
                  disabled={acting === offer.responseId}
                  onPress={() => void settle(offer, false)}
                />
              </View>
            </View>
          ))}
          <Divider />
        </View>
      ) : null}

      <Card>
        <Txt size={15} weight="bold" color={onVoid.primary}>
          {t.whatYouNeed}
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {POSITIONS.map((code) => {
            const on = picked.includes(code);
            return (
              <PressScale
                key={code}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={label(code)}
                onPress={() => toggle(code)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: radius.control,
                  borderWidth: 1,
                  borderColor: on ? goldAlpha.frame : onVoid.line,
                  backgroundColor: on ? goldAlpha.fill : 'transparent',
                }}
              >
                <Txt size={13} weight="medium" color={on ? gold.base : onVoid.secondary}>
                  {label(code)}
                </Txt>
              </PressScale>
            );
          })}
        </View>
        <Txt size={11.5} lh={1.5} color={onVoid.faint}>
          {picked.length ? t.positionsPicked : t.anyPositionBlurb}
        </Txt>
      </Card>

      <Card>
        <Txt size={15} weight="bold" color={onVoid.primary}>
          {t.callMessage}
        </Txt>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t.callNoteHint}
          placeholderTextColor={onVoid.dim}
          multiline
          style={{
            minHeight: 110,
            maxHeight: 160,
            paddingHorizontal: 14,
            paddingTop: 12,
            borderRadius: radius.row,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: onVoid.line,
            color: onVoid.primary,
            backgroundColor: void_.bg,
            textAlignVertical: 'top',
          }}
        />
      </Card>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: advanced }}
        onPress={() => setAdvanced((a) => !a)}
        hitSlop={8}
      >
        <Txt size={12.5} weight="medium" color={gold.base}>
          {advanced ? t.hideAdvanced : t.advancedSettings}
        </Txt>
      </Pressable>

      {advanced ? (
        <View style={{ gap: 8 }}>
          <Eyebrow>{t.minimumRating}</Eyebrow>
          <TextInput
            value={minOvr}
            onChangeText={setMinOvr}
            placeholder={t.minimumRatingHint}
            placeholderTextColor={onVoid.dim}
            keyboardType="number-pad"
            style={{
              height: 46,
              paddingHorizontal: 14,
              borderRadius: radius.control,
              borderWidth: 1,
              borderColor: onVoid.edge,
              color: onVoid.primary,
              backgroundColor: void_.surface,
            }}
          />
          <Txt size={11.5} lh={1.5} color={onVoid.faint}>
            {t.minimumRatingBlurb}
          </Txt>
        </View>
      ) : null}

      {notice ? (
        <Txt size={12.5} lh={1.5} color={burgundy.action}>
          {notice}
        </Txt>
      ) : null}

      <View style={{ gap: 10 }}>
        <ActionButton
          label={call ? t.updateCall : t.sendCall}
          icon={<Megaphone size={18} color={void_.bg} />}
          disabled={busy}
          onPress={() => void publish()}
        />
        {call ? <ActionButton label={t.stopCalling} variant="ghost" disabled={busy} onPress={() => void stop()} /> : null}
      </View>

      <Txt size={11.5} lh={1.5} color={onVoid.faint}>
        {t.callReachBlurb}
      </Txt>
    </Screen>
  );
}
