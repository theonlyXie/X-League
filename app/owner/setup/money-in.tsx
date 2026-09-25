import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { OpField, OpNotice } from '@/components/operative';
import {
  OpActionButton,
  OpCard,
  OpEmpty,
  OpGroup,
  OpLink,
  OpMenuGroup,
  OpPage,
  OpPill,
  OpPills,
} from '@/components/kitOperative';
import { Wallet } from '@/components/icons';
import { gold, ink, onOperative, operative, radius } from '@/theme/tokens';
import { mono } from '@/theme/typography';
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
    <OpPage
      title={t.ownMoneyIn}
      subtitle={activeVenue?.name}
      footer={
        mayEdit ? (
          <OpActionButton
            label={t.ownAddDestination}
            disabled={busy || label.trim().length < 2 || value.trim().length < 3}
            onPress={() => void add()}
            flex
          />
        ) : undefined
      }
    >
      <OpNotice text={notice} />

      <OpGroup hint={t.ownMoneyInBlurb}>
        {loading ? <ActivityIndicator color={ink} /> : null}

        {!loading && unreachable ? <OpNotice text={t.listUnreachable} /> : null}

        {!loading && !unreachable && channels.length === 0 ? <OpEmpty title={t.ownNoDestinations} /> : null}

        {channels.length > 0 ? (
          <OpMenuGroup>
            {channels.map((c) => (
              <View
                key={c.channelId}
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 13, paddingVertical: 13, paddingHorizontal: 14 }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: radius.icon,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: c.active ? 'rgba(198,163,75,.18)' : operative.band,
                  }}
                >
                  <Wallet size={19} color={c.active ? gold.ink : onOperative.dim} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Txt size={14.5} weight="semibold" color={ink}>
                      {c.label}
                    </Txt>
                    <Badge label={kindLabel(c.kind)} />
                    {!c.active ? <Badge label={t.ownDestinationOff} /> : null}
                  </View>
                  <Txt size={13} weight="semibold" color={onOperative.secondary} style={{ fontFamily: mono }}>
                    {c.value}
                  </Txt>
                  {c.instructions ? (
                    <Txt size={11.5} lh={1.45} color={onOperative.faint}>
                      {c.instructions}
                    </Txt>
                  ) : null}

                  {mayEdit ? (
                    <View style={{ flexDirection: 'row', gap: 18, paddingTop: 6 }}>
                      <OpLink
                        label={c.active ? t.ownHideIt : t.ownShowIt}
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
                      />
                      <OpLink
                        label={t.ownRemoveIt}
                        accessibilityLabel={`${t.ownRemoveIt} ${c.label}`}
                        tone="danger"
                        disabled={busy}
                        onPress={() => void run(() => deleteVenuePaymentChannel(c.channelId))}
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </OpMenuGroup>
        ) : null}
      </OpGroup>

      {mayEdit ? (
        <OpGroup title={t.ownAddDestination}>
          <OpCard>
            <OpPills>
              {KINDS.map((k) => (
                <OpPill key={k} size="sm" label={kindLabel(k)} on={k === kind} onPress={() => setKind(k)} />
              ))}
            </OpPills>

            <OpField
              label={t.ownDestinationName}
              value={label}
              onChangeText={setLabel}
              placeholder={t.ownDestinationNamePlaceholder}
            />
            <OpField
              label={t.ownDestinationValue}
              value={value}
              onChangeText={setValue}
              placeholder={t.ownDestinationValuePlaceholder}
              autoCapitalize="none"
            />
            <OpField
              label={t.ownDestinationNote}
              value={instructions}
              onChangeText={setInstructions}
              placeholder={t.ownDestinationNotePlaceholder}
              multiline
            />
          </OpCard>
        </OpGroup>
      ) : null}
    </OpPage>
  );
}

/** A small uppercase word beside a destination's name: its kind, or "off". */
function Badge({ label }: { label: string }) {
  return (
    <View
      style={{
        paddingVertical: 2,
        paddingHorizontal: 6,
        borderRadius: radius.badge,
        backgroundColor: operative.band,
      }}
    >
      <Txt size={9.5} weight="bold" em={0.08} upper color={onOperative.muted}>
        {label}
      </Txt>
    </View>
  );
}
