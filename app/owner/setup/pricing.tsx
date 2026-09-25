import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { OpField, OpNotice } from '@/components/operative';
import {
  OpActionButton,
  OpCard,
  OpEmpty,
  OpGroup,
  OpMenuGroup,
  OpPage,
  OpPill,
  OpPills,
} from '@/components/kitOperative';
import { gold, ink, onOperative } from '@/theme/tokens';
import { mono } from '@/theme/typography';
import { setPriceRule, venuePriceRules, type PriceRule } from '@/data/manage';
import { venueDetail, type VenuePitch } from '@/data/discovery';
import { useSession } from '@/state/session';
import { isLive } from '@/lib/supabase';
import { useI18n } from '@/i18n';

/**
 * O-03 — what each hour sells for.
 *
 * Prices are versioned by validity window rather than edited in place: a
 * booking taken last week was quoted against the rule that was live then, and
 * overwriting the row would make that quote unreproducible. So the list shows
 * superseded rules greyed rather than hiding them, and setting a new price
 * closes the old one rather than replacing it.
 */
export default function Pricing() {
  const { reason, t } = useI18n();
  const { activeVenue } = useSession();
  const venue = activeVenue;

  const [rules, setRules] = useState<PriceRule[]>([]);
  const [pitches, setPitches] = useState<VenuePitch[]>([]);
  const [pitchId, setPitchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(isLive);
  const [notice, setNotice] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const [from, setFrom] = useState('18');
  const [to, setTo] = useState('23');
  const [price, setPrice] = useState('300');

  const load = useCallback(async () => {
    if (!isLive || !venue) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [rows, detail] = await Promise.all([
        venuePriceRules(venue.venueId),
        venueDetail(venue.venueId),
      ]);
      setRules(rows);
      setPitches(detail?.pitches ?? []);
      setPitchId((current) => current ?? detail?.pitches[0]?.id ?? null);
      setNotice(null);
    } catch {
      setNotice(t.ownPricingUnreadable);
    } finally {
      setLoading(false);
    }
  }, [venue?.venueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = rules.filter((r) => (showHistory || r.live) && (!pitchId || r.pitchId === pitchId));

  const save = async () => {
    if (!pitchId) return;
    const res = await setPriceRule(
      pitchId,
      Number(from),
      Number(to),
      Number(price),
    );
    if (res.ok) {
      setNotice(null);
      void load();
    } else {
      setNotice(reason(res.reason) ?? null);
    }
  };

  return (
    <OpPage
      title={t.ownPricing}
      subtitle={pitches.find((p) => p.id === pitchId)?.label ?? venue?.name}
      footer={<OpActionButton label={t.ownSavePrice} onPress={save} disabled={!pitchId} flex />}
    >
      {pitches.length > 1 ? (
        <OpPills>
          {pitches.map((p) => (
            <OpPill key={p.id} label={p.label} on={p.id === pitchId} onPress={() => setPitchId(p.id)} />
          ))}
        </OpPills>
      ) : null}

      <OpNotice text={notice} />
      {loading ? <ActivityIndicator color={ink} /> : null}

      <OpGroup
        title={t.ownInForce}
        action={showHistory ? t.ownHideHistory : t.ownShowHistory}
        onAction={() => setShowHistory((s) => !s)}
      >
        {shown.length > 0 ? (
          <OpMenuGroup>
            {shown.map((r) => (
              <View
                key={r.ruleId}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 13,
                  paddingHorizontal: 14,
                  opacity: r.live ? 1 : 0.55,
                }}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <Txt size={14} weight="semibold" color={ink}>
                    {r.pitchLabel} · {r.startHour}:00–{r.endHour}:00
                  </Txt>
                  <Txt size={11.5} color={onOperative.faint}>
                    {r.live ? t.liveFrom(r.validFrom) : `${r.validFrom} → ${r.validTo ?? '—'}`}
                  </Txt>
                </View>
                {/* Gold for the rule in force: it is the price a player is
                    quoted tonight. Superseded ones stay ink, and greyed. */}
                <Txt size={15} weight="bold" color={r.live ? gold.ink : ink} style={{ fontFamily: mono }}>
                  {r.priceEgp}
                </Txt>
              </View>
            ))}
          </OpMenuGroup>
        ) : null}
        {shown.length === 0 && !loading ? <OpEmpty title={t.ownNoPriceSet} /> : null}
      </OpGroup>

      <OpGroup title={t.ownSetPrice} hint={t.ownPricingHint}>
        <OpCard>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <OpField label={t.ownFrom} value={from} onChangeText={setFrom} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <OpField label={t.ownTo} value={to} onChangeText={setTo} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1.3 }}>
              <OpField label={t.ownPrice} value={price} onChangeText={setPrice} keyboardType="number-pad" />
            </View>
          </View>
        </OpCard>
      </OpGroup>
    </OpPage>
  );
}
