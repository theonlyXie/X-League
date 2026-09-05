import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { OpButton, OpHeader, OpNotice, OpRow, OpScreen, OpSection } from '@/components/operative';
import { ink, onOperative, radius } from '@/theme/tokens';
import {
  confirmBookingPayment,
  venueConversation,
  venuePaymentClaims,
  type ChannelKind,
  type PaymentClaim,
} from '@/data/venueMoney';
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
 * Every row opens the room it came from. A transfer that needs explaining —
 * short, late, to the wrong number — needs somewhere to explain it, and the
 * list is not that place.
 */
export default function Claims() {
  const { reason, t, num, moment } = useI18n();
  const router = useRouter();
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

  const openThread = async (c: PaymentClaim) => {
    try {
      const res = await venueConversation(c.bookingId);
      if (res.ok && res.conversationId) router.push(`/owner/thread/${res.conversationId}`);
      else setNotice(reason(res.reason) ?? null);
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
    <OpScreen>
      <OpHeader title={t.ownClaims} onBack={() => router.back()} />
      <OpNotice text={notice} />

      <OpSection
        title={t.ownClaims}
        hint={waiting > 0 ? t.ownWaitingOnYou(num(waiting)) : t.ownClaimsBlurb}
      >
        {loading ? <ActivityIndicator color={ink} /> : null}

        {!loading && unreachable ? (
          <Txt size={12.5} color="rgba(20,18,16,.55)">
            {t.listUnreachable}
          </Txt>
        ) : null}

        {!loading && !unreachable && claims.length === 0 ? (
          <Txt size={12.5} color="rgba(20,18,16,.55)">
            {t.ownNoClaims}
          </Txt>
        ) : null}

        <View style={{ gap: 10 }}>
          {claims.map((c) => (
            <View
              key={c.bookingId}
              style={{
                padding: 13,
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: c.settled ? onOperative.line : ink,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Txt size={13.5} weight="semibold" color={ink} style={{ flex: 1 }}>
                  {c.captainName}
                </Txt>
                <Txt size={13.5} weight="bold" color={ink}>
                  {num(c.priceEgp)}
                </Txt>
              </View>

              <Txt size={11.5} color="rgba(20,18,16,.55)">
                {c.code} · {c.pitchLabel} · {moment(c.startsAt)}
                {c.kind ? ` · ${kindLabel(c.kind)}` : ''}
              </Txt>

              {c.note ? (
                <Txt size={12.5} lh={1.5} color="rgba(20,18,16,.75)">
                  {c.note}
                </Txt>
              ) : null}

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {c.settled ? (
                  <Txt size={11.5} weight="semibold" color="rgba(20,18,16,.5)">
                    {t.ownConfirmed}
                  </Txt>
                ) : (
                  <OpButton
                    label={t.ownConfirmArrived}
                    disabled={busy}
                    onPress={() => void confirm(c)}
                  />
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t.ownOpenThread} ${c.code}`}
                  onPress={() => void openThread(c)}
                  hitSlop={8}
                >
                  <Txt size={11.5} weight="semibold" color={ink}>
                    {t.ownOpenThread}
                  </Txt>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      </OpSection>
    </OpScreen>
  );
}
