import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { TextInput } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { ActionButton, BackHeader, Card, SafeTop, SectionTitle, StickyFooter, Unreachable } from '@/components/kit';
import { CheckCircle } from '@/components/icons';
import { gold, onVoid, radius, void_ } from '@/theme/tokens';
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
 *
 * Laid out as the redesign's venue registration: what to have ready, then one
 * titled section per thing asked for. The checklist names only what this
 * screen asks — a name and an area — because that is all the server takes.
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
    <View style={{ flex: 1, backgroundColor: void_.bg }}>
      <SafeTop />
      <BackHeader
        title={t.venueOpen}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/me'))}
      />

      {/* The footer rides up with the keyboard, so the button is never behind
          it while somebody is still typing the area. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, gap: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Card>
            <Txt size={13} lh={1.6} color={onVoid.muted}>
              {t.venueOpenBlurb}
            </Txt>
            <View style={{ height: 1, backgroundColor: onVoid.edgeFaint }} />
            <View style={{ gap: 4 }}>
              <Txt size={14.5} weight="bold" color={onVoid.primary}>
                {t.entryVenueReadyTitle}
              </Txt>
              <Txt size={12} color={onVoid.faint}>
                {t.entryVenueReadyBlurb}
              </Txt>
            </View>
            <View style={{ gap: 10 }}>
              <ReadyItem label={t.entryVenueReadyName} done={name.trim().length >= 2} />
              <ReadyItem label={t.entryVenueReadyArea} done={area.trim().length >= 2} />
            </View>
          </Card>

          <Section title={t.entryVenueAbout} blurb={t.entryVenueNameBlurb}>
            <Field label={t.authVenueName} value={name} onChangeText={setName} placeholder="Stadium One" />
          </Section>

          <Section title={t.entryVenueWhere} blurb={t.entryVenueWhereBlurb}>
            <Field label={t.authVenueArea} value={area} onChangeText={setArea} placeholder="Nasr City" />
          </Section>

          {/* VEN-006: said here rather than discovered later. */}
          <Txt size={11.5} lh={1.6} color={onVoid.faint}>
            {t.authVenuePending}
          </Txt>

          {error ? <Unreachable label={error} /> : null}
        </ScrollView>

        <StickyFooter>
          <ActionButton
            flex
            label={busy ? t.authWorking : t.venueOpenCta}
            disabled={!ready || busy}
            onPress={submit}
            icon={busy ? <ActivityIndicator color={void_.bg} /> : undefined}
          />
        </StickyFooter>
      </KeyboardAvoidingView>
    </View>
  );
}

/** One line of the checklist. It ticks itself as the field below is filled. */
function ReadyItem({ label, done }: { label: string; done: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <CheckCircle size={18} color={done ? gold.base : onVoid.dim} filled={done} />
      <Txt size={13} color={done ? onVoid.primary : onVoid.secondary} style={{ flex: 1 }}>
        {label}
      </Txt>
    </View>
  );
}

/** A heading, the one line that says why it is asked, and the input. */
function Section({ title, blurb, children }: { title: string; blurb: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 4 }}>
        <SectionTitle title={title} />
        <Txt size={12} lh={1.5} color={onVoid.faint}>
          {blurb}
        </Txt>
      </View>
      {children}
    </View>
  );
}

/** Sign-in's field, so the two forms a new owner meets read as one product. */
function Field({
  label,
  ...input
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 8 }}>
      <Txt size={13} weight="semibold" color={onVoid.secondary}>
        {label}
      </Txt>
      <TextInput
        placeholderTextColor="rgba(243,238,229,.25)"
        accessibilityLabel={label}
        {...input}
        style={{
          height: 52,
          borderRadius: radius.row,
          borderWidth: 1,
          borderColor: onVoid.line,
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
