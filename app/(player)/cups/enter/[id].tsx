import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { TextInput } from '@/components/TextField';
import * as Haptics from 'expo-haptics';
import { Txt } from '@/components/Txt';
import { Avatar } from '@/components/Avatar';
import { PressScale, Reveal } from '@/components/motion';
import { ActionButton, BackHeader, Card, KeyValue, Radio, SafeTop, StickyFooter, Unreachable } from '@/components/kit';
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
 *
 * Laid out like checkout: a card for each decision, the price line by line,
 * and the amount with the one action pinned at the foot.
 */
export default function EnterCup() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { reason, t, num, money } = useI18n();
  const { signedIn } = useSession();

  const [clubs, setClubs] = useState<ClubSummary[]>([]);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [points, setPoints] = useState(0);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteFailed, setQuoteFailed] = useState(false);
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
        setQuoteFailed(q === null);
      } catch {
        setQuote(null);
        setQuoteFailed(true);
      }
    },
    // `signedIn` belongs here. Without it this closure kept the value it was
    // built with — false, because the session had not been restored yet — and
    // the effect below re-ran with the stale one when the session arrived. The
    // quote was never asked for, so the captain reached checkout with no fee,
    // no points and no total, and nothing said why.
    [id, signedIn],
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
        setNotice(reason(res.reason) ?? t.offline);
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
      if (!res.ok) setNotice(reason(res.reason) ?? t.offline);
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

  const choosing = signedIn && clubs.length > 0 && !entered;
  const noClub = signedIn && !loading && !unreachable && !clubs.length && !entered;

  const noteField = (
    <TextInput
      value={note}
      onChangeText={setNote}
      placeholder={t.paymentNotePlaceholder}
      placeholderTextColor={onVoid.disabled}
      accessibilityLabel={t.paymentNote}
      multiline
      style={{
        minHeight: 72,
        borderRadius: radius.row,
        borderWidth: 1,
        borderColor: onVoid.line,
        backgroundColor: void_.bg,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: onVoid.primary,
        textAlignVertical: 'top',
      }}
    />
  );

  return (
    // The same keyboard handling `Screen` gives a form: the note and the code
    // sit low enough on the page that the keyboard would otherwise cover them.
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: void_.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeTop />
      <BackHeader
        title={t.enterCup}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/cups'))}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        {loading ? <ActivityIndicator color={gold.base} /> : null}
        {unreachable ? <Unreachable label={t.offline} /> : null}

        {entered ? (
          <Reveal>
            <Card style={{ borderColor: goldAlpha.frame, gap: 8 }}>
              <Txt size={16} weight="bold" color={gold.base}>
                {t.entrySubmitted}
              </Txt>
              <Txt size={13} lh={1.5} color={onVoid.secondary}>
                {t.entryPending}
              </Txt>
            </Card>
          </Reveal>
        ) : null}

        {!signedIn ? (
          <Card>
            <Txt size={13} lh={1.5} color={onVoid.muted}>
              {t.signInToSee}
            </Txt>
          </Card>
        ) : null}

        {noClub ? (
          <Card>
            <Txt size={14} weight="semibold" color={onVoid.primary}>
              {t.noEligibleClub}
            </Txt>
            <Txt size={12} lh={1.5} color={onVoid.muted}>
              {t.needFive}
            </Txt>
          </Card>
        ) : null}

        {choosing ? (
          <>
            <Card>
              <Txt size={15} weight="bold" color={onVoid.primary}>
                {t.chooseClub}
              </Txt>
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
                    <Radio on={on} />
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
            </Card>

            <Card>
              <Txt size={15} weight="bold" color={onVoid.primary}>
                {t.promoCode}
              </Txt>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  value={code}
                  onChangeText={(text) => setCode(text.toUpperCase())}
                  placeholder={t.promoPlaceholder}
                  placeholderTextColor={onVoid.disabled}
                  accessibilityLabel={t.promoCode}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={{
                    flex: 1,
                    height: 50,
                    borderRadius: radius.row,
                    borderWidth: 1,
                    borderColor: onVoid.line,
                    backgroundColor: void_.bg,
                    paddingHorizontal: 14,
                    color: onVoid.primary,
                  }}
                />
                <ActionButton label={t.applyCode} variant="ghost" onPress={applyCode} />
              </View>
              {quote && !quote.promoOk && reason(quote.reason) ? (
                <Txt size={12} color={burgundy.action}>
                  {reason(quote.reason)}
                </Txt>
              ) : null}
              {quote?.promoOk && quote.promoOffEgp > 0 ? (
                <Txt size={12} weight="semibold" color={gold.base}>
                  {t.codeApplied}
                </Txt>
              ) : null}
            </Card>

            {quote ? (
              <Card>
                <Txt size={15} weight="bold" color={onVoid.primary}>
                  {t.usePoints}
                </Txt>
                <PressScale
                  accessibilityRole="button"
                  accessibilityState={{ selected: points > 0 }}
                  accessibilityLabel={t.usePoints}
                  onPress={spendAll}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderRadius: radius.row,
                    borderWidth: 1,
                    borderColor: points > 0 ? goldAlpha.frame : onVoid.line,
                    backgroundColor: points > 0 ? goldAlpha.fill : 'transparent',
                    padding: 12,
                  }}
                >
                  <Radio on={points > 0} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Txt size={14} weight="semibold" color={onVoid.primary}>
                      {t.pointsBalance(num(quote.pointsBalance))}
                    </Txt>
                    <Txt size={12} color={onVoid.faint}>
                      {points > 0 ? t.pointsWorth(money(quote.pointsOffEgp)) : t.pointsCapNote}
                    </Txt>
                  </View>
                </PressScale>
              </Card>
            ) : null}

            {!quote && quoteFailed ? (
              <Txt size={13} lh={1.5} color={burgundy.action}>
                {t.priceUnreadable}
              </Txt>
            ) : null}

            {quote ? (
              <Card>
                <Txt size={15} weight="bold" color={onVoid.primary}>
                  {t.priceDetails}
                </Txt>
                <KeyValue label={t.entryFeeLabel} value={money(quote.feeEgp)} />
                {quote.promoOffEgp > 0 ? (
                  <KeyValue label={t.discount} value={`− ${money(quote.promoOffEgp)}`} />
                ) : null}
                {quote.pointsOffEgp > 0 ? (
                  <KeyValue label={t.pointsOff} value={`− ${money(quote.pointsOffEgp)}`} />
                ) : null}
                <View style={{ height: 1, backgroundColor: onVoid.edgeFaint }} />
                <KeyValue label={t.amountDue} value={money(quote.amountDueEgp)} strong />
              </Card>
            ) : null}

            <Card>
              <Txt size={15} weight="bold" color={onVoid.primary}>
                {t.payTo}
              </Txt>
              {!channels.length ? (
                <Txt size={13} color={onVoid.muted}>
                  {t.noChannels}
                </Txt>
              ) : null}
              {channels.map((channel, i) => (
                <View
                  key={`${channel.kind}-${channel.value}-${i}`}
                  style={{
                    gap: 3,
                    paddingTop: i > 0 ? 12 : 0,
                    borderTopWidth: i > 0 ? 1 : 0,
                    borderTopColor: onVoid.edgeFaint,
                  }}
                >
                  <Txt size={11.5} weight="semibold" color={gold.base}>
                    {channelLabel(channel.kind)}
                  </Txt>
                  <Txt size={14.5} weight="bold" color={onVoid.primary} selectable>
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
            </Card>

            <Card>
              <Txt size={15} weight="bold" color={onVoid.primary}>
                {t.paymentNote}
              </Txt>
              {noteField}
            </Card>
          </>
        ) : null}

        {entered ? (
          <Card>
            <Txt size={15} weight="bold" color={onVoid.primary}>
              {t.paymentNote}
            </Txt>
            {noteField}
          </Card>
        ) : null}

        {notice ? (
          <Txt size={12.5} weight="semibold" color={burgundy.action}>
            {notice}
          </Txt>
        ) : null}
      </ScrollView>

      {/* One action at the foot, whichever state the entry is in. */}
      {!signedIn ? (
        <StickyFooter>
          <ActionButton label={t.signIn} flex onPress={() => router.push('/sign-in?next=/cups')} />
        </StickyFooter>
      ) : entered ? (
        <StickyFooter>
          <ActionButton label={t.cups} variant="ghost" flex onPress={() => router.replace('/cups')} />
          <ActionButton label={t.confirmSent} flex disabled={!note.trim() || busy} onPress={sayItIsSent} />
        </StickyFooter>
      ) : choosing ? (
        <StickyFooter>
          {quote ? (
            <View style={{ gap: 2 }}>
              <Txt size={17} weight="bold" color={onVoid.primary}>
                {money(quote.amountDueEgp)}
              </Txt>
              <Txt size={10.5} color={onVoid.dim}>
                {t.amountDue}
              </Txt>
            </View>
          ) : null}
          <ActionButton label={t.confirmSent} flex disabled={!chosen || busy} onPress={submit} />
        </StickyFooter>
      ) : noClub ? (
        <StickyFooter>
          <ActionButton label={t.clubs} flex onPress={() => router.push('/clubs')} />
        </StickyFooter>
      ) : null}
    </KeyboardAvoidingView>
  );
}
