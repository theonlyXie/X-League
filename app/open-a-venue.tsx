import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { TextInput } from '@/components/TextField';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Eyebrow } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { face } from '@/theme/typography';
import { useSession } from '@/state/session';
import { useI18n } from '@/i18n';
import { registerMyVenue } from '@/data/manage';

/**
 * A player who turns out to have a pitch.
 *
 * Sign-up asks player or venue owner, and that answer used to be final: the
 * only code that created a venue ran inside sign-up, so the second answer cost
 * a second account on a second number — which AUTH-005 forbids.
 *
 * There is no role to switch here. Owner Mode appears on the account screen
 * because `my_venues` returns something, so listing the ground is the whole
 * promotion, and the person keeps the card they play on.
 */
export default function OpenAVenue() {
  const router = useRouter();
  const { refreshIdentity } = useSession();
  const { reason, t } = useI18n();

  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = name.trim().length >= 2 && area.trim().length >= 2;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await registerMyVenue(name.trim(), area.trim());
      if (!res.ok) {
        setError(res.reason ? (reason(res.reason) ?? res.reason) : t.listUnreachable);
        return;
      }
      // Before leaving, so the console it lands on knows about the venue it is
      // supposed to be showing rather than reading an empty staff list.
      await refreshIdentity();
      router.replace('/owner');
    } catch {
      setError(t.listUnreachable);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          hitSlop={10}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))}
          style={{
            width: 34,
            height: 34,
            borderRadius: radius.icon,
            borderWidth: 1,
            borderColor: 'rgba(243,238,229,.14)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={16} color={onVoid.secondary} />
        </Pressable>
      </View>

      <View style={{ gap: 8 }}>
        <Txt size={26} weight="bold" em={-0.02} color={onVoid.primary}>
          {t.venueOpen}
        </Txt>
        <Txt size={13} lh={1.6} color={onVoid.muted}>
          {t.venueOpenBlurb}
        </Txt>
      </View>

      <View style={{ gap: 16 }}>
        <Field label={t.authVenueName} value={name} onChangeText={setName} placeholder="Stadium One" />
        <Field label={t.authVenueArea} value={area} onChangeText={setArea} placeholder="Nasr City" />
        {/* VEN-006: said here rather than discovered later. */}
        <Txt size={11.5} lh={1.6} color="rgba(243,238,229,.38)">
          {t.authVenuePending}
        </Txt>
      </View>

      {error ? (
        <View
          accessibilityRole="alert"
          style={{
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: radius.chip,
            borderWidth: 1,
            borderColor: 'rgba(101,21,37,.5)',
            backgroundColor: 'rgba(101,21,37,.09)',
          }}
        >
          <Txt size={12.5} lh={1.5} color={burgundy.action}>
            {error}
          </Txt>
        </View>
      ) : null}

      <Button
        label={busy ? t.authWorking : t.venueOpenCta}
        height={52}
        round={radius.control}
        size={15}
        disabled={!ready || busy}
        onPress={submit}
      />

      {busy ? <ActivityIndicator color={gold.base} /> : null}
    </Screen>
  );
}

function Field({
  label,
  ...input
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 8 }}>
      <Eyebrow>{label}</Eyebrow>
      <TextInput
        placeholderTextColor="rgba(243,238,229,.25)"
        accessibilityLabel={label}
        {...input}
        style={{
          height: 52,
          borderRadius: radius.control,
          borderWidth: 1,
          borderColor: goldAlpha.edge,
          backgroundColor: void_.surface,
          color: onVoid.primary,
          fontFamily: face.semibold,
          fontSize: 16,
          paddingHorizontal: 16,
        }}
      />
    </View>
  );
}
