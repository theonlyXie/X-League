import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Switch, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { OpNotice } from '@/components/operative';
import { OpCard, OpGroup, OpMenuGroup, OpMenuRow, OpPage } from '@/components/kitOperative';
import { Inbox } from '@/components/icons';
import { ink, onOperative } from '@/theme/tokens';
import { setPayAtVenue, venueRequests } from '@/data/manage';
import { venuePayAtVenue } from '@/data/api';
import { useSession } from '@/state/session';
import { isLive } from '@/lib/supabase';
import { useI18n } from '@/i18n';

/**
 * How this venue takes bookings.
 *
 * One switch, and it decides which of two things a player's tap does. On, and
 * they book outright and settle at the gate — what the app used to do for every
 * venue, without asking any of them. Off, and every booking arrives here as a
 * request somebody has to answer.
 *
 * Off is the default, including for venues that were already in the database
 * when this shipped. That is deliberate: an arrangement nobody agreed to should
 * not be grandfathered in on the grounds that it happens to be running.
 *
 * Owners only. The server enforces it — a manager's tap is refused there, not
 * here — but the switch is drawn disabled for a manager so the refusal is not a
 * surprise arriving after the gesture.
 */
export default function BookingSetup() {
  const { reason, t, num } = useI18n();
  const router = useRouter();
  const { activeVenue } = useSession();
  const venueId = activeVenue?.venueId ?? null;
  const isOwner = activeVenue?.role === 'owner';

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [loading, setLoading] = useState(isLive);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isLive || !venueId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [gate, rows] = await Promise.all([
        venuePayAtVenue(venueId),
        venueRequests(venueId).catch(() => []),
      ]);
      setAllowed(gate);
      setWaiting(rows.length);
    } catch {
      setNotice(t.listUnreachable);
    } finally {
      setLoading(false);
    }
  }, [venueId, t.listUnreachable]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (next: boolean) => {
    if (!venueId || busy) return;
    setBusy(true);
    setNotice(null);
    // Moved before the round trip so the switch answers the thumb, and put
    // back by `load()` below if the server disagrees.
    setAllowed(next);
    try {
      const res = await setPayAtVenue(venueId, next);
      if (!res.ok) setNotice(reason(res.reason) ?? null);
    } catch {
      setNotice(t.listUnreachable);
    } finally {
      setBusy(false);
      await load();
    }
  };

  return (
    <OpPage title={t.ownBooking}>
      <OpNotice text={notice} />

      <OpGroup title={t.payAtVenueTitle} hint={t.payAtVenueExplain}>
        {loading ? <ActivityIndicator color={ink} /> : null}

        {!loading ? (
          <OpCard pad={14}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Txt size={14} weight="semibold" color={ink} style={{ flex: 1 }}>
                {allowed ? t.payAtVenueOn : t.payAtVenueOff}
              </Txt>
              <Switch
                value={Boolean(allowed)}
                disabled={!isOwner || busy}
                onValueChange={(v) => void toggle(v)}
                accessibilityLabel={t.payAtVenueTitle}
              />
            </View>

            {!isOwner ? (
              <Txt size={12} color={onOperative.faint}>
                {t.ownOwnerOnly}
              </Txt>
            ) : null}
          </OpCard>
        ) : null}
      </OpGroup>

      {/* Only worth offering where there is something to answer. A venue that
          takes money at the gate never has a request, and a row leading to a
          permanently empty list reads as a broken screen. */}
      {!loading && allowed === false ? (
        <OpGroup title={t.venueRequests}>
          <OpMenuGroup>
            <OpMenuRow
              icon={<Inbox size={19} color={ink} />}
              title={t.venueRequests}
              detail={waiting > 0 ? t.ownWaitingOnYou(num(waiting)) : t.noVenueRequests}
              onPress={() => router.push('/owner/requests')}
            />
          </OpMenuGroup>
        </OpGroup>
      ) : null}
    </OpPage>
  );
}
