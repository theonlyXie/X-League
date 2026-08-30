import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { OpHeader, OpNotice, OpRow, OpScreen, OpSection } from '@/components/operative';
import { burgundy, gold, ink, onOperative } from '@/theme/tokens';
import { venueCustomers, type VenueCustomer } from '@/data/manage';
import { useSession } from '@/state/session';
import { isLive } from '@/lib/supabase';
import { useI18n } from '@/i18n';

/**
 * O-09 — who plays here.
 *
 * A venue could see tonight's arrivals and a day's grid, and had no way to ask
 * the question every pitch owner actually asks: who are my regulars, and who
 * keeps not turning up. The rows were all there and nothing read them across
 * more than a single day.
 *
 * Phone and walk-in customers sit in the same list as app ones, grouped by name
 * where there is no account, because a venue taking half its business at the
 * desk would otherwise see that half as a list of unrelated strangers.
 */
export default function OwnerCustomers() {
  const router = useRouter();
  const { t, num, money, shortDate } = useI18n();
  const { activeVenue } = useSession();
  const venue = activeVenue;

  const [rows, setRows] = useState<VenueCustomer[]>([]);
  const [loading, setLoading] = useState(isLive);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isLive || !venue) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await venueCustomers(venue.venueId));
      setError(null);
    } catch {
      // Said rather than shown as an empty list. "Nobody has played here" and
      // "we could not read who has" are different sentences, and only one of
      // them is true of a venue that has been trading for a month.
      setError(t.ownCustomersUnreadable);
    } finally {
      setLoading(false);
    }
  }, [venue?.venueId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <OpScreen>
      <OpHeader title={t.ownCustomers} onBack={() => router.back()} />
      <OpNotice text={error} />
      {loading ? <ActivityIndicator color={ink} /> : null}

      <OpSection title={t.ownCustomers} hint={t.ownCustomersBlurb}>
        {!loading && !error && rows.length === 0 ? (
          <View style={{ gap: 4 }}>
            <Txt size={13} weight="semibold" color={ink}>
              {t.ownCustomersEmpty}
            </Txt>
            <Txt size={11.5} color={onOperative.muted}>
              {t.ownCustomersEmptyBlurb}
            </Txt>
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          {rows.map((c) => (
            <OpRow key={c.key} accent={c.noShows > 0}>
              <View style={{ flex: 1, gap: 3 }}>
                <Txt size={13.5} weight="semibold" color={ink}>
                  {c.name}
                </Txt>
                <Txt size={10.5} color="rgba(20,18,16,.45)">
                  {[
                    c.bookings === 1 ? t.ownOneVisit : t.ownVisits(num(c.bookings)),
                    t.ownLastVisit(shortDate(c.lastVisit)),
                    c.hasAccount ? t.ownOnTheApp : t.ownAtTheDesk,
                  ].join(' · ')}
                </Txt>
                {/* Only when there are any. A zero here would put the word
                    "no-show" against the name of somebody who has never
                    missed one. */}
                {c.noShows > 0 ? (
                  <Txt size={10.5} color={burgundy.ink}>
                    {c.noShows === 1 ? t.ownOneNoShow : t.ownNoShowsCount(num(c.noShows))}
                  </Txt>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Txt size={13} weight="semibold" color={ink}>
                  {money(c.grossEgp)}
                </Txt>
                {/* The money screen's own two words, for the same two
                    questions: what their hours sold for, and what the gate
                    actually took. */}
                <Txt size={10} color={c.collectedEgp > 0 ? gold.ink : onOperative.dim}>
                  {money(c.collectedEgp)}
                </Txt>
              </View>
            </OpRow>
          ))}
        </View>
      </OpSection>
    </OpScreen>
  );
}
