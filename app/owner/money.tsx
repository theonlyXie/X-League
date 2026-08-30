import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { OpMono, OpNotice, OpRow, OpScreen, OpSection, OpTile } from '@/components/operative';
import { gold, ink, onOperative } from '@/theme/tokens';
import { venuePayouts, type PayoutRow } from '@/data/manage';
import { useSession } from '@/state/session';
import { isLive } from '@/lib/supabase';
import { useI18n } from '@/i18n';

/**
 * O-06 — what the venue is owed.
 *
 * Deliberately built from payment obligations rather than from booking states:
 * a booking being confirmed does not say whether the cash actually arrived, and
 * the number a venue reconciles against at the end of a week is the second one.
 */
export default function OwnerMoney() {
  const { t, num } = useI18n();
  const { activeVenue } = useSession();
  const venue = activeVenue;

  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(isLive);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isLive || !venue) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await venuePayouts(venue.venueId));
      setError(null);
    } catch {
      setError(t.ownLedgerUnreadable);
    } finally {
      setLoading(false);
    }
  }, [venue?.venueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = rows.reduce(
    (acc, r) => ({
      collected: acc.collected + r.collectedEgp,
      outstanding: acc.outstanding + r.outstandingEgp,
      forfeited: acc.forfeited + r.forfeitedEgp,
    }),
    { collected: 0, outstanding: 0, forfeited: 0 },
  );

  return (
    <OpScreen>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <OpTile label={t.ownCollected} value={num(total.collected)} sub={t.ownEgp30Days} accent />
        <OpTile label={t.ownOutstanding} value={num(total.outstanding)} sub={t.ownEgpAtGate} />
        <OpTile label={t.ownForfeited} value={num(total.forfeited)} sub={t.ownForfeitedSub} />
      </View>

      <OpNotice text={error} />

      {loading ? <ActivityIndicator color={ink} /> : null}

      <OpSection title={t.ownByEvening} hint={t.ownGrossHint}>
        {rows.length === 0 && !loading ? (
          <Txt size={12.5} color={onOperative.dim}>
            {t.ownNothingBooked}
          </Txt>
        ) : null}

        <View style={{ gap: 8 }}>
          {rows.map((r) => (
            <OpRow key={r.onDate} accent={r.outstandingEgp > 0}>
              <View style={{ flex: 1, gap: 3 }}>
                <Txt size={13} weight="semibold" color={ink}>
                  {r.onDate}
                </Txt>
                <Txt size={10.5} color="rgba(20,18,16,.45)">
                  {t.ownDayLine(num(r.bookings), num(r.grossEgp))}
                </Txt>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <OpMono>{r.collectedEgp} in</OpMono>
                {r.outstandingEgp > 0 ? (
                  <Txt size={10.5} color={gold.ink}>
                    {r.outstandingEgp} due
                  </Txt>
                ) : null}
              </View>
            </OpRow>
          ))}
        </View>
      </OpSection>
    </OpScreen>
  );
}
