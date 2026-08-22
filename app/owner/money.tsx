import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { OpMono, OpNotice, OpRow, OpScreen, OpSection, OpTile } from '@/components/operative';
import { gold, ink, onOperative } from '@/theme/tokens';
import { venuePayouts, type PayoutRow } from '@/data/manage';
import { useSession } from '@/state/session';
import { isLive } from '@/lib/supabase';

/**
 * O-06 — what the venue is owed.
 *
 * Deliberately built from payment obligations rather than from booking states:
 * a booking being confirmed does not say whether the cash actually arrived, and
 * the number a venue reconciles against at the end of a week is the second one.
 */
export default function OwnerMoney() {
  const { venues } = useSession();
  const venue = venues[0] ?? null;

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
      setError('Could not read the payout ledger for this venue.');
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
        <OpTile label="COLLECTED" value={`${total.collected}`} sub="EGP · 30 days" accent />
        <OpTile label="OUTSTANDING" value={`${total.outstanding}`} sub="EGP at the gate" />
        <OpTile label="FORFEITED" value={`${total.forfeited}`} sub="late or no-show" />
      </View>

      <OpNotice text={error} />

      {loading ? <ActivityIndicator color={ink} /> : null}

      <OpSection title="By evening" hint="Gross is what the pitch-hours were sold for. Collected is what the gate actually took.">
        {rows.length === 0 && !loading ? (
          <Txt size={12.5} color={onOperative.dim}>
            Nothing booked in this window yet.
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
                  {r.bookings} bookings · {r.grossEgp} gross
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
