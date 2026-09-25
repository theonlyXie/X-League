import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { OpNotice } from '@/components/operative';
import { OpActionButton, OpCard, OpEmpty, OpGroup, OpPage } from '@/components/kitOperative';
import { gold, ink, onOperative } from '@/theme/tokens';
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
    <OpPage title={t.venueRequests} subtitle={activeVenue?.name}>
      <OpNotice text={notice} />

      <OpGroup hint={rows.length > 0 ? t.ownWaitingOnYou(num(rows.length)) : t.payAtVenueExplain}>
        {loading ? <ActivityIndicator color={ink} /> : null}

        {!loading && unreachable ? <OpNotice text={t.listUnreachable} /> : null}

        {!loading && !unreachable && rows.length === 0 ? <OpEmpty title={t.noVenueRequests} /> : null}

        {rows.map((r) => (
          // Ink-edged: each of these is a player waiting, and the hour is held
          // from everybody else until somebody here answers.
          <OpCard key={r.bookingId} pad={14} style={{ borderColor: onOperative.line }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Txt size={15} weight="bold" color={ink} numberOfLines={1}>
                  {r.captainName}
                </Txt>
                <Txt size={12} color={onOperative.faint}>
                  {r.pitchLabel} · {moment(r.startsAt)} · {t.minutesShort(num(r.minutes))}
                </Txt>
              </View>
              <Txt size={15} weight="bold" color={gold.ink}>
                {money(r.priceEgp)}
              </Txt>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <OpActionButton
                label={t.decline}
                accessibilityLabel={`${t.decline} ${r.captainName}`}
                variant="ghost"
                disabled={busy === r.bookingId}
                onPress={() => void answer(r, false)}
                flex
              />
              <OpActionButton
                label={t.accept}
                disabled={busy === r.bookingId}
                onPress={() => void answer(r, true)}
                flex
              />
            </View>
          </OpCard>
        ))}
      </OpGroup>
    </OpPage>
  );
}
