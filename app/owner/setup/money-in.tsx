import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { TextInput } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { OpButton, OpHeader, OpNotice, OpRow, OpScreen, OpSection } from '@/components/operative';
import { ink, onOperative, radius } from '@/theme/tokens';
import {
  deleteVenuePaymentChannel,
  setVenuePaymentChannel,
  venuePaymentChannels,
  type ChannelKind,
  type VenueChannel,
} from '@/data/venueMoney';
import { useSession } from '@/state/session';
import { isLive } from '@/lib/supabase';
import { useI18n } from '@/i18n';

const KINDS: ChannelKind[] = ['wallet', 'instapay', 'bank', 'contact'];

/**
 * Where a player sends the money for an hour on this venue's pitch.
 *
 * Nothing on this screen is guessed. A wallet number typed wrong sends a
 * stranger's money to a stranger, so the field is required, it is never
 * defaulted, and a venue with nothing here is honestly described to players as
 * a venue that takes cash at the gate — which is what it is.
 *
 * A destination can be switched off rather than deleted, because the season a
 * venue changes wallets is the season somebody looks at an old booking and
 * needs to know where the money went.
 */
export default function MoneyIn() {
  const { reason, t } = useI18n();
  const router = useRouter();
  const { activeVenue } = useSession();
  const venueId = activeVenue?.venueId ?? null;
  const mayEdit = activeVenue?.role === 'manager' || activeVenue?.role === 'owner';

  const [channels, setChannels] = useState<VenueChannel[]>([]);
  const [loading, setLoading] = useState(isLive);
  const [unreachable, setUnreachable] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<ChannelKind>('wallet');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [instructions, setInstructions] = useState('');

  const load = useCallback(async () => {
    if (!isLive || !venueId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setChannels(await venuePaymentChannels(venueId));
      setUnreachable(false);
    } catch {
      setChannels([]);
      setUnreachable(true);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<{ ok: boolean; reason?: string }>) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fn();
      if (!res.ok) setNotice(reason(res.reason) ?? null);
      await load();
      return res.ok;
    } catch {
      setNotice(t.offline);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!venueId) return;
    const ok = await run(() =>
      setVenuePaymentChannel({
        venueId,
        kind,
        label: label.trim(),
        value: value.trim(),
        instructions: instructions.trim() || null,
      }),
    );
    if (!ok) return;
    setLabel('');
    setValue('');
    setInstructions('');
  };

  const kindLabel = (k: ChannelKind) =>
    k === 'wallet'
      ? t.payWallet
      : k === 'instapay'
        ? t.payInstapay
        : k === 'bank'
          ? t.payBank
          : t.payContact;

  return (
    <OpScreen>
      <OpHeader title={t.ownMoneyIn} onBack={() => router.back()} />
      <OpNotice text={notice} />

      <OpSection title={t.ownMoneyIn} hint={t.ownMoneyInBlurb}>
        {loading ? <ActivityIndicator color={ink} /> : null}

        {!loading && unreachable ? (
          <Txt size={12.5} color="rgba(20,18,16,.55)">
            {t.listUnreachable}
          </Txt>
        ) : null}

        {!loading && !unreachable && channels.length === 0 ? (
          <Txt size={12.5} lh={1.5} color="rgba(20,18,16,.55)">
            {t.ownNoDestinations}
          </Txt>
        ) : null}

        <View style={{ gap: 8 }}>
          {channels.map((c) => (
            <OpRow key={c.channelId}>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Txt size={13.5} weight="semibold" color={ink}>
                    {c.label}
                  </Txt>
                  <Txt size={10} weight="bold" em={0.08} upper color="rgba(20,18,16,.4)">
                    {kindLabel(c.kind)}
                  </Txt>
                  {!c.active ? (
                    <Txt size={10} weight="bold" em={0.08} upper color="rgba(20,18,16,.4)">
                      {t.ownDestinationOff}
                    </Txt>
                  ) : null}
                </View>
                <Txt size={12.5} color="rgba(20,18,16,.6)">
                  {c.value}
                </Txt>
                {c.instructions ? (
                  <Txt size={11} lh={1.45} color="rgba(20,18,16,.45)">
                    {c.instructions}
                  </Txt>
                ) : null}
              </View>

              {mayEdit ? (
                <View style={{ gap: 6, alignItems: 'flex-end' }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={c.active ? t.ownHideIt : t.ownShowIt}
                    disabled={busy}
                    onPress={() =>
                      void run(() =>
                        setVenuePaymentChannel({
                          channelId: c.channelId,
                          venueId: venueId as string,
                          kind: c.kind,
                          label: c.label,
                          value: c.value,
                          instructions: c.instructions,
                          active: !c.active,
                          sort: c.sort,
                        }),
                      )
                    }
                    hitSlop={8}
                  >
                    <Txt size={11.5} weight="semibold" color={ink}>
                      {c.active ? t.ownHideIt : t.ownShowIt}
                    </Txt>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t.ownRemoveIt} ${c.label}`}
                    disabled={busy}
                    onPress={() => void run(() => deleteVenuePaymentChannel(c.channelId))}
                    hitSlop={8}
                  >
                    <Txt size={11.5} color="rgba(140,40,40,.9)">
                      {t.ownRemoveIt}
                    </Txt>
                  </Pressable>
                </View>
              ) : null}
            </OpRow>
          ))}
        </View>
      </OpSection>

      {mayEdit ? (
        <OpSection title={t.ownAddDestination}>
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {KINDS.map((k) => {
                const on = k === kind;
                return (
                  <Pressable
                    key={k}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={kindLabel(k)}
                    onPress={() => setKind(k)}
                    style={{
                      paddingHorizontal: 12,
                      height: 34,
                      justifyContent: 'center',
                      borderRadius: radius.chip,
                      borderWidth: 1,
                      borderColor: on ? ink : onOperative.line,
                      backgroundColor: on ? 'rgba(20,18,16,.06)' : 'transparent',
                    }}
                  >
                    <Txt size={12} weight={on ? 'semibold' : 'regular'} color={ink}>
                      {kindLabel(k)}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>

            <Field
              label={t.ownDestinationName}
              value={label}
              onChangeText={setLabel}
              placeholder={t.ownDestinationNamePlaceholder}
            />
            <Field
              label={t.ownDestinationValue}
              value={value}
              onChangeText={setValue}
              placeholder={t.ownDestinationValuePlaceholder}
            />
            <Field
              label={t.ownDestinationNote}
              value={instructions}
              onChangeText={setInstructions}
              placeholder={t.ownDestinationNotePlaceholder}
            />

            <OpButton
              label={t.ownAddDestination}
              disabled={busy || label.trim().length < 2 || value.trim().length < 3}
              onPress={() => void add()}
            />
          </View>
        </OpSection>
      ) : null}
    </OpScreen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Txt size={10.5} weight="bold" em={0.08} upper color="rgba(20,18,16,.45)">
        {label}
      </Txt>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(20,18,16,.3)"
        style={{
          height: 44,
          borderRadius: radius.control,
          borderWidth: 1,
          borderColor: onOperative.line,
          paddingHorizontal: 12,
          color: ink,
        }}
      />
    </View>
  );
}
