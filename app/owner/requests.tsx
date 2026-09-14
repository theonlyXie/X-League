import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { OpButton, OpHeader, OpNotice, OpScreen, OpSection } from '@/components/operative';
import { ink, onOperative, radius } from '@/theme/tokens';
import { respondToBookingRequest, venueRequests, type BookingRequest } from '@/data/manage';
import { useSession } from '@/state/session';
import { isLive } from '@/lib/supabase';
import { useI18n } from '@/i18n';

/**
 * Hours somebody has asked for, and the venue's answer.
 *
 * This screen only has anything on it where the venue has *not* switched on
 * paying at the gate. Where it has, a booking is a booking and there is nothing
 * to answer — which is why an empty list here is a normal state rather than a
 * sign that something is broken, and why the blurb says so.
 *
 * Accepting mints the booking code. That is the whole reason this cannot be a
 * passive list: until somebody here presses the button, the player has no
 * booking and no reference, and the hour is blocked for everybody else.
 */
export default function Requests() {
  const { reason, t, num, money, moment } = useI18n();
  const router = useRouter();
  const { activeVenue } = useSession();
  const venueId = activeVenue?.venueId ?? null;

  const [rows, setRows] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(isLive);
  const [unreachable, setUnreachable] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isLive || !venueId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await venueRequests(venueId));
      setUnreachable(false);
    } catch {
      setRows([]);
      setUnreachable(true);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const answer = async (r: BookingRequest, accept: boolean) => {
    setBusy(r.bookingId);
    setNotice(null);
    try {
      const res = await respondToBookingRequest(r.bookingId, accept);
      if (!res.ok) setNotice(reason(res.reason) ?? null);
      else if (accept && res.code) setNotice(t.ownRequestAccepted(res.code));
      await load();
    } catch {
      setNotice(t.listUnreachable);
    } finally {
      setBusy(null);
    }
  };

  return (
    <OpScreen>
      <OpHeader title={t.venueRequests} onBack={() => router.back()} />
      <OpNotice text={notice} />

      <OpSection
        title={t.venueRequests}
        hint={rows.length > 0 ? t.ownWaitingOnYou(num(rows.length)) : t.payAtVenueExplain}
      >
        {loading ? <ActivityIndicator color={ink} /> : null}

        {!loading && unreachable ? (
          <Txt size={12.5} color="rgba(20,18,16,.55)">
            {t.listUnreachable}
          </Txt>
        ) : null}

        {!loading && !unreachable && rows.length === 0 ? (
          <Txt size={12.5} color="rgba(20,18,16,.55)">
            {t.noVenueRequests}
          </Txt>
        ) : null}

        <View style={{ gap: 10 }}>
          {rows.map((r) => (
            <View
              key={r.bookingId}
              style={{
                padding: 13,
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: ink,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Txt size={13.5} weight="semibold" color={ink} style={{ flex: 1 }}>
                  {r.captainName}
                </Txt>
                <Txt size={13.5} weight="bold" color={ink}>
                  {money(r.priceEgp)}
                </Txt>
              </View>

              <Txt size={11.5} color="rgba(20,18,16,.55)">
                {r.pitchLabel} · {moment(r.startsAt)} · {t.minutesShort(num(r.minutes))}
              </Txt>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <OpButton
                  label={t.accept}
                  disabled={busy === r.bookingId}
                  onPress={() => void answer(r, true)}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t.decline} ${r.captainName}`}
                  disabled={busy === r.bookingId}
                  onPress={() => void answer(r, false)}
                  hitSlop={8}
                >
                  <Txt size={11.5} weight="semibold" color={ink}>
                    {t.decline}
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
