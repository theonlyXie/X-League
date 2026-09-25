import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { OpMono, OpNotice, OpTile } from '@/components/operative';
import { OpEmpty, OpGroup, OpHeading, OpMenuGroup, OpMenuRow, OpPage, opIconInk } from '@/components/kitOperative';
import { Users, Wallet } from '@/components/icons';
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
  const { t, num, shortDate } = useI18n();
  const router = useRouter();
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
    <OpPage>
      <OpHeading title={t.ownTabMoney} />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <OpTile label={t.ownCollected} value={num(total.collected)} sub={t.ownEgp30Days} accent />
        <OpTile label={t.ownOutstanding} value={num(total.outstanding)} sub={t.ownEgpAtGate} />
        <OpTile label={t.ownForfeited} value={num(total.forfeited)} sub={t.ownForfeitedSub} />
      </View>

      <OpNotice text={error} />

      <OpMenuGroup>
        {/* Money somebody says they have already sent, waiting to be checked
            against the wallet. Above the takings on purpose: a player is waiting
            on each of these, and the day's total is not. */}
        <OpMenuRow
          icon={<Wallet size={19} color={opIconInk('money')} />}
          tone="money"
          title={t.ownClaims}
          detail={t.ownClaimsBlurb}
          onPress={() => router.push('/owner/claims')}
        />
        {/* The other half of the commercial picture, and the only way into it —
            Owner Mode's tab bar is five items by design and this is not a sixth. */}
        <OpMenuRow
          icon={<Users size={19} color={ink} />}
          title={t.ownCustomers}
          detail={t.ownCustomersBlurb}
          onPress={() => router.push('/owner/customers')}
        />
      </OpMenuGroup>

      {loading ? <ActivityIndicator color={ink} /> : null}

      <OpGroup title={t.ownByEvening} hint={t.ownGrossHint}>
        {rows.length === 0 && !loading ? <OpEmpty title={t.ownNothingBooked} /> : null}

        {rows.length > 0 ? (
          <OpMenuGroup>
            {rows.map((r) => (
              <View
                key={r.onDate}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14 }}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <Txt size={14} weight="semibold" color={ink}>
                    {shortDate(`${r.onDate}T12:00:00Z`)}
                  </Txt>
                  <Txt size={11.5} color={onOperative.faint}>
                    {t.ownDayLine(num(r.bookings), num(r.grossEgp))}
                  </Txt>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  {/* These two were bare English — `300 in`, `150 due` — on a
                      screen otherwise read in the manager's language. */}
                  <OpMono>{t.ownerAmountIn(num(r.collectedEgp))}</OpMono>
                  {r.outstandingEgp > 0 ? (
                    <Txt size={11.5} weight="semibold" color={gold.ink}>
                      {t.ownerAmountDue(num(r.outstandingEgp))}
                    </Txt>
                  ) : null}
                </View>
              </View>
            ))}
          </OpMenuGroup>
        ) : null}
      </OpGroup>
    </OpPage>
  );
}
