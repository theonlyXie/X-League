import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Txt } from '@/components/Txt';
import {
  OpButton,
  OpField,
  OpHeader,
  OpMono,
  OpNotice,
  OpRow,
  OpScreen,
  OpSection,
} from '@/components/operative';
import { gold, ink, onOperative, radius } from '@/theme/tokens';
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
  const { t } = useI18n();
  const router = useRouter();
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
      setNotice(res.reason ?? null);
    }
  };

  return (
    <OpScreen>
      <OpHeader title={t.ownPricing} onBack={() => router.back()} />

      {pitches.length > 1 ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {pitches.map((p) => {
            const on = p.id === pitchId;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={p.label}
                onPress={() => setPitchId(p.id)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 13,
                  borderRadius: radius.chip,
                  borderWidth: 1,
                  borderColor: on ? ink : onOperative.hairline,
                  backgroundColor: on ? ink : 'transparent',
                }}
              >
                <Txt size={12} weight="semibold" color={on ? '#FFFDF9' : ink}>
                  {p.label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <OpNotice text={notice} />
      {loading ? <ActivityIndicator color={ink} /> : null}

      <OpSection
        title={t.ownInForce}
        action={
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => setShowHistory((s) => !s)}>
            <Txt size={11} weight="semibold" color={ink}>
              {showHistory ? t.ownHideHistory : t.ownShowHistory}
            </Txt>
          </Pressable>
        }
      >
        <View style={{ gap: 8 }}>
          {shown.map((r) => (
            <OpRow key={r.ruleId} accent={r.live} style={r.live ? undefined : { opacity: 0.55 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Txt size={13} weight="semibold" color={ink}>
                  {r.pitchLabel} · {r.startHour}:00–{r.endHour}:00
                </Txt>
                <Txt size={10.5} color="rgba(20,18,16,.45)">
                  {r.live ? `From ${r.validFrom}` : `${r.validFrom} → ${r.validTo ?? '—'}`}
                </Txt>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <OpMono>{r.priceEgp}</OpMono>
                <Txt size={10} color="rgba(20,18,16,.42)">
                </Txt>
              </View>
            </OpRow>
          ))}
          {shown.length === 0 && !loading ? (
            <Txt size={12.5} color={onOperative.dim}>
              No price set for this pitch. Hours will quote as free until one is.
            </Txt>
          ) : null}
        </View>
      </OpSection>

      <OpSection
        title={t.ownSetPrice}
        hint="Applies from today. Any rule it overlaps is closed, and the hours it does not cover keep their old price."
      >
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <OpField label={t.ownFrom} value={from} onChangeText={setFrom} keyboardType="number-pad" width={72} />
          <OpField label={t.ownTo} value={to} onChangeText={setTo} keyboardType="number-pad" width={72} />
          <OpField label={t.ownPrice} value={price} onChangeText={setPrice} keyboardType="number-pad" width={92} />
        </View>
        <OpButton label={t.ownSavePrice} onPress={save} disabled={!pitchId} />
      </OpSection>
    </OpScreen>
  );
}
