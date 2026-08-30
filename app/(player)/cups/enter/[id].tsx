import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Divider, Eyebrow } from '@/components/ui';
import { Avatar } from '@/components/Avatar';
import { PressScale, Reveal } from '@/components/motion';
import { ArrowLeft } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { myClubs, type ClubSummary } from '@/data/clubs';
import {
  claimPayment,
  enterCup,
  paymentChannels,
  registrationQuote,
  type PaymentChannel,
  type Quote,
} from '@/data/entry';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';
import { useSession } from '@/state/session';

/**
 * Entering a cup: which club, what it costs, and where to send the money.
 *
 * The quote is re-asked whenever the code or the points change, and the entry
 * recomputes it again server-side. That is deliberate duplication: a captain
 * shown "EGP 300, code applied" who then registers separately can be charged
 * something else in between, so the screen's number is a preview and the
 * server's is the decision.
 *
 * Nothing here takes money. The channels are where to send it, the note is what
 * the captain says they sent, and somebody at X League agrees afterwards — the
 * copy says so rather than implying a receipt.
 */
export default function EnterCup() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, num, money } = useI18n();
  const { signedIn } = useSession();

  const [clubs, setClubs] = useState<ClubSummary[]>([]);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [points, setPoints] = useState(0);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(isLive);
  const [unreachable, setUnreachable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [entered, setEntered] = useState<string | null>(null);

  useEffect(() => {
    if (!isLive || !signedIn || !id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [mine, where] = await Promise.all([myClubs(), paymentChannels(id)]);
        if (cancelled) return;
        const eligible = mine.filter((c) => c.state === 'active' && c.isCaptain && c.eligible);
        setClubs(eligible);
        setChosen(eligible[0]?.clubId ?? null);
        setChannels(where);
        setUnreachable(false);
      } catch {
        if (!cancelled) setUnreachable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, signedIn]);

  const ask = useCallback(
    async (withCode: string, withPoints: number) => {
      if (!isLive || !id || !signedIn) return;
      try {
        const q = await registrationQuote(id, withCode.trim() || null, withPoints);
        setQuote(q);
      } catch {
        setQuote(null);
      }
    },
    [id],
  );

  useEffect(() => {
    void ask('', 0);
  }, [ask, signedIn]);

  async function applyCode() {
    await ask(code, points);
    void Haptics.selectionAsync();
  }

  async function spendAll() {
    if (!quote) return;
    const next = points > 0 ? 0 : quote.pointsBalance;
    setPoints(next);
    await ask(code, next);
    void Haptics.selectionAsync();
  }

  async function submit() {
    if (!id || !chosen || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await enterCup(id, chosen, {
        promoCode: code.trim() || null,
        points,
        paymentNote: note.trim() || null,
      });
      if (res.ok && res.registrationId) {
        setEntered(res.registrationId);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setNotice(res.reason ?? t.offline);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch {
      setNotice(t.offline);
    } finally {
      setBusy(false);
    }
  }

  async function sayItIsSent() {
    if (!entered || !note.trim()) return;
    setBusy(true);
    try {
      const res = await claimPayment(entered, note.trim());
      if (!res.ok) setNotice(res.reason ?? t.offline);
    } catch {
      setNotice(t.offline);
    } finally {
      setBusy(false);
    }
  }

  const channelLabel = (kind: PaymentChannel['kind']) =>
    kind === 'instapay'
      ? t.payInstapay
      : kind === 'bank'
        ? t.payBank
        : kind === 'wallet'
          ? t.payWallet
          : t.payContact;

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/cups'))}
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
          {t.enterCup}
        </Txt>
      </View>

      {loading ? <ActivityIndicator color={gold.base} /> : null}
      {unreachable ? (
        <Txt size={13} color={onVoid.muted}>
          {t.offline}
        </Txt>
      ) : null}

      {entered ? (
        <Reveal>
          <View
            style={{
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: goldAlpha.frame,
              backgroundColor: void_.inset,
              padding: 16,
              gap: 8,
            }}
          >
            <Txt size={16} weight="semibold" color={gold.base}>
              {t.entrySubmitted}
            </Txt>
            <Txt size={13} lh={1.5} color={onVoid.secondary}>
              {t.entryPending}
            </Txt>
          </View>
        </Reveal>
      ) : null}

      {!signedIn ? (
        <View style={{ gap: 12 }}>
          <Txt size={13} lh={1.5} color={onVoid.muted}>
            {t.signInToSee}
          </Txt>
          <Button label={t.signIn} onPress={() => router.push('/sign-in?next=/cups')} />
        </View>
      ) : null}

      {signedIn && !loading && !unreachable && !clubs.length && !entered ? (
        <View style={{ gap: 12 }}>
          <Txt size={13} lh={1.5} color={onVoid.muted}>
            {t.noEligibleClub}
          </Txt>
          <Txt size={12} lh={1.5} color={onVoid.dim}>
            {t.needFive}
          </Txt>
          <Button label={t.clubs} onPress={() => router.push('/clubs')} />
        </View>
      ) : null}

      {signedIn && clubs.length > 0 && !entered ? (
        <>
          <View style={{ gap: 10 }}>
            <Eyebrow>{t.chooseClub}</Eyebrow>
            {clubs.map((club) => {
              const on = chosen === club.clubId;
              return (
                <PressScale
                  key={club.clubId}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={club.name}
                  onPress={() => {
                    setChosen(club.clubId);
                    void Haptics.selectionAsync();
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderRadius: radius.row,
                    borderWidth: 1,
                    borderColor: on ? goldAlpha.frame : onVoid.line,
                    backgroundColor: on ? goldAlpha.fill : 'transparent',
                    padding: 12,
                  }}
                >
                  <Avatar
                    name={club.name}
                    url={club.crestUrl}
                    size={36}
                    radius={radius.chip}
                    background={void_.raised}
                    border={goldAlpha.edge}
                    color={gold.base}
                  />
                  <Txt size={14} weight="semibold" color={onVoid.primary} style={{ flex: 1 }}>
                    {club.name}
                  </Txt>
                </PressScale>
              );
            })}
          </View>

          <Divider />

          <View style={{ gap: 10 }}>
            <Eyebrow>{t.promoCode}</Eyebrow>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput
                value={code}
                onChangeText={(text) => setCode(text.toUpperCase())}
                placeholder={t.promoPlaceholder}
                placeholderTextColor={onVoid.disabled}
                autoCapitalize="characters"
                autoCorrect={false}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: radius.control,
                  borderWidth: 1,
                  borderColor: onVoid.line,
                  backgroundColor: void_.surface,
                  paddingHorizontal: 14,
                  color: onVoid.primary,
                }}
              />
              <Button label={t.applyCode} width={92} onPress={applyCode} />
            </View>
            {quote && !quote.promoOk && quote.reason ? (
              <Txt size={12} color={burgundy.action}>
                {quote.reason}
              </Txt>
            ) : null}
            {quote?.promoOk && quote.promoOffEgp > 0 ? (
              <Txt size={12} color={gold.base}>
                {t.codeApplied}
              </Txt>
            ) : null}
          </View>

          {quote ? (
            <View style={{ gap: 10 }}>
              <Eyebrow>{t.usePoints}</Eyebrow>
              <PressScale
                accessibilityRole="button"
                accessibilityState={{ selected: points > 0 }}
                accessibilityLabel={t.usePoints}
                onPress={spendAll}
                style={{
                  borderRadius: radius.row,
                  borderWidth: 1,
                  borderColor: points > 0 ? goldAlpha.frame : onVoid.line,
                  backgroundColor: points > 0 ? goldAlpha.fill : 'transparent',
                  padding: 12,
                  gap: 3,
                }}
              >
                <Txt size={14} weight="semibold" color={onVoid.primary}>
                  {t.pointsBalance(num(quote.pointsBalance))}
                </Txt>
                <Txt size={12} color={onVoid.faint}>
                  {points > 0
                    ? t.pointsWorth(money(quote.pointsOffEgp))
                    : t.pointsCapNote}
                </Txt>
              </PressScale>
            </View>
          ) : null}

          {quote ? (
            <View
              style={{
                borderRadius: radius.card,
                borderWidth: 1,
                borderColor: onVoid.edge,
                backgroundColor: void_.surface,
                padding: 14,
                gap: 8,
              }}
            >
              <Line label={t.entryFeeLabel} value={money(quote.feeEgp)} />
              {quote.promoOffEgp > 0 ? (
                <Line label={t.discount} value={`− ${money(quote.promoOffEgp)}`} accent />
              ) : null}
              {quote.pointsOffEgp > 0 ? (
                <Line label={t.pointsOff} value={`− ${money(quote.pointsOffEgp)}`} accent />
              ) : null}
              <Divider />
              <Line label={t.amountDue} value={money(quote.amountDueEgp)} strong />
            </View>
          ) : null}

          <View style={{ gap: 10 }}>
            <Eyebrow>{t.payTo}</Eyebrow>
            {!channels.length ? (
              <Txt size={13} color={onVoid.muted}>
                {t.noChannels}
              </Txt>
            ) : null}
            {channels.map((channel, i) => (
              <View
                key={`${channel.kind}-${channel.value}-${i}`}
                style={{
                  borderRadius: radius.row,
                  borderWidth: 1,
                  borderColor: onVoid.line,
                  backgroundColor: void_.surface,
                  padding: 12,
                  gap: 3,
                }}
              >
                <Txt size={11} weight="medium" upper em={0.08} color={onVoid.dim}>
                  {channelLabel(channel.kind)}
                </Txt>
                <Txt size={14} weight="semibold" color={onVoid.primary}>
                  {channel.value}
                </Txt>
                <Txt size={12} color={onVoid.faint}>
                  {channel.label}
                </Txt>
                {channel.instructions ? (
                  <Txt size={12} lh={1.5} color={onVoid.faint}>
                    {channel.instructions}
                  </Txt>
                ) : null}
              </View>
            ))}
          </View>

          <View style={{ gap: 10 }}>
            <Eyebrow>{t.paymentNote}</Eyebrow>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t.paymentNotePlaceholder}
              placeholderTextColor={onVoid.disabled}
              multiline
              style={{
                minHeight: 64,
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: onVoid.line,
                backgroundColor: void_.surface,
                paddingHorizontal: 14,
                paddingVertical: 10,
                color: onVoid.primary,
                textAlignVertical: 'top',
              }}
            />
          </View>

          <Button
            label={t.confirmSent}
            disabled={!chosen || busy}
            onPress={submit}
          />

          {notice ? (
            <Txt size={12} color={burgundy.action}>
              {notice}
            </Txt>
          ) : null}
        </>
      ) : null}

      {entered ? (
        <View style={{ gap: 10 }}>
          <Eyebrow>{t.paymentNote}</Eyebrow>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t.paymentNotePlaceholder}
            placeholderTextColor={onVoid.disabled}
            multiline
            style={{
              minHeight: 64,
              borderRadius: radius.control,
              borderWidth: 1,
              borderColor: onVoid.line,
              backgroundColor: void_.surface,
              paddingHorizontal: 14,
              paddingVertical: 10,
              color: onVoid.primary,
              textAlignVertical: 'top',
            }}
          />
          <Button label={t.confirmSent} disabled={!note.trim() || busy} onPress={sayItIsSent} />
          <Button label={t.cups} variant="ghost" onPress={() => router.replace('/cups')} />
        </View>
      ) : null}
    </Screen>
  );
}

function Line({
  label,
  value,
  accent,
  strong,
}: {
  label: string;
  value: string;
  accent?: boolean;
  strong?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Txt size={13} color={strong ? onVoid.primary : onVoid.secondary}>
        {label}
      </Txt>
      <Txt
        size={strong ? 16 : 13}
        weight={strong ? 'bold' : 'medium'}
        color={accent ? gold.base : onVoid.primary}
      >
        {value}
      </Txt>
    </View>
  );
}
