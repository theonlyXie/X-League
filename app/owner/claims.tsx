import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { OpNotice } from '@/components/operative';
import { OpActionButton, OpCard, OpEmpty, OpGroup, OpPage } from '@/components/kitOperative';
import { ChatBubble, CheckCircle } from '@/components/icons';
import { gold, ink, onOperative, operative, radius, status } from '@/theme/tokens';
import {
  confirmBookingPayment,
  venuePaymentClaims,
  type ChannelKind,
  type PaymentClaim,
} from '@/data/venueMoney';
import { bookingWhatsapp } from '@/data/social';
import { openWhatsApp } from '@/lib/whatsapp';
import { useSession } from '@/state/session';
import { isLive } from '@/lib/supabase';
import { useI18n } from '@/i18n';

/**
 * What players say they have sent, and the venue's answer.
 *
 * Two different sentences kept apart on purpose. A claim is a person saying
 * they transferred money; confirming is somebody at the venue having looked at
 * the wallet and found it. Only the second one settles what the venue is owed,
 * which is why the button says "it arrived" rather than "accept".
 *
 * Every row reaches the captain who made the claim. A transfer that needs
 * explaining — short, late, to the wrong number — needs somewhere to explain
 * it, and the list is not that place. That used to be a thread inside the
 * app; it is now the captain's own number, opened in WhatsApp.
 */
export default function Claims() {
  const { reason, t, num, moment } = useI18n();
  const { activeVenue } = useSession();
  const venueId = activeVenue?.venueId ?? null;

  const [claims, setClaims] = useState<PaymentClaim[]>([]);
  const [loading, setLoading] = useState(isLive);
  const [unreachable, setUnreachable] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isLive || !venueId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setClaims(await venuePaymentClaims(venueId));
      setUnreachable(false);
    } catch {
      setClaims([]);
      setUnreachable(true);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = async (c: PaymentClaim) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await confirmBookingPayment(c.bookingId);
      if (!res.ok) setNotice(reason(res.reason) ?? null);
      await load();
    } catch {
      setNotice(t.offline);
    } finally {
      setBusy(false);
    }
  };

  const reachCaptain = async (c: PaymentClaim) => {
    try {
      const res = await bookingWhatsapp(c.bookingId);
      if (!res.ok || !res.reachable) {
        setNotice(reason(res.reason) ?? null);
        return;
      }
      if (!(await openWhatsApp(res.reachable.waNumber))) setNotice(t.couldNotOpenWhatsApp);
    } catch {
      setNotice(t.offline);
    }
  };

  const kindLabel = (k: ChannelKind | null) =>
    k === 'wallet'
      ? t.payWallet
      : k === 'instapay'
        ? t.payInstapay
        : k === 'bank'
          ? t.payBank
          : k === 'contact'
            ? t.payContact
            : '';

  const waiting = claims.filter((c) => !c.settled).length;

  return (
    <OpPage title={t.ownClaims} subtitle={activeVenue?.name}>
      <OpNotice text={notice} />

      <OpGroup hint={waiting > 0 ? t.ownWaitingOnYou(num(waiting)) : t.ownClaimsBlurb}>
        {loading ? <ActivityIndicator color={ink} /> : null}

        {!loading && unreachable ? <OpNotice text={t.listUnreachable} /> : null}

        {!loading && !unreachable && claims.length === 0 ? <OpEmpty title={t.ownNoClaims} /> : null}

        {claims.map((c) => (
          // Gold-edged while it is waiting: it is money somebody says is
          // already the venue's. Settled ones drop back to a plain card.
          <OpCard key={c.bookingId} pad={14} accent={!c.settled}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Txt size={15} weight="bold" color={ink} numberOfLines={1}>
                  {c.captainName}
                </Txt>
                <Txt size={12} color={onOperative.faint}>
                  {c.code} · {c.pitchLabel} · {moment(c.startsAt)}
                  {c.kind ? ` · ${kindLabel(c.kind)}` : ''}
                </Txt>
              </View>
              <Txt size={15} weight="bold" color={gold.ink}>
                {num(c.priceEgp)}
              </Txt>
            </View>

            {c.note ? (
              <View style={{ padding: 12, borderRadius: radius.row, backgroundColor: operative.bg }}>
                <Txt size={12.5} lh={1.5} color={onOperative.secondary}>
                  {c.note}
                </Txt>
              </View>
            ) : null}

            {c.settled ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <CheckCircle size={18} color={status.positive} />
                <Txt size={13} weight="semibold" color={status.positive}>
                  {t.ownConfirmed}
                </Txt>
              </View>
            ) : (
              <OpActionButton label={t.ownConfirmArrived} disabled={busy} onPress={() => void confirm(c)} />
            )}
            <OpActionButton
              label={t.ownMessageCaptain}
              accessibilityLabel={`${t.ownMessageCaptain} ${c.code}`}
              variant="ghost"
              icon={<ChatBubble size={17} color={ink} />}
              onPress={() => void reachCaptain(c)}
            />
          </OpCard>
        ))}
      </OpGroup>
    </OpPage>
  );
}
