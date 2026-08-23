import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Eyebrow } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { VoidMark } from '@/components/VoidMark';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { face } from '@/theme/typography';
import { useSession } from '@/state/session';
import { useI18n } from '@/i18n';
import { myCard } from '@/data/api';

/**
 * P-01 Onboarding — signing in, and joining.
 *
 * AUTH-001 asks for a number and a one-time password, and that is still where
 * this is going. Until there is an SMS provider it is a number and a password
 * the person chooses: Supabase refuses phone signups with no SMS configured,
 * so an OTP screen here would mean nobody could create an account at all.
 *
 * Two roles join through the same form, because AUTH-005 says one person is one
 * account. Somebody with a pitch to fill answers two more questions and their
 * venue goes into the verification queue; nothing about them is a second login.
 */

type Mode = 'in' | 'join';
type Role = 'player' | 'venue_owner';

export default function SignIn() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();
  const { signIn, signUp } = useSession();
  const { t } = useI18n();

  const [mode, setMode] = useState<Mode>('in');
  const [role, setRole] = useState<Role>('player');
  const [phone, setPhone] = useState('+20');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [venueName, setVenueName] = useState('');
  const [venueArea, setVenueArea] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneUsable = phone.replace(/\D/g, '').length >= 8;
  const ready =
    mode === 'in'
      ? phoneUsable && password.length >= 8
      : phoneUsable &&
        password.length >= 8 &&
        name.trim().length >= 2 &&
        (role === 'player' || (venueName.trim().length >= 2 && venueArea.trim().length >= 2));

  /**
   * Where somebody lands once they are in. A venue owner goes to their console;
   * a player with no card yet has unfinished onboarding, and dropping them on a
   * home screen that shows no identity would look broken rather than new.
   */
  const land = async () => {
    if (mode === 'join' && role === 'venue_owner') {
      router.replace('/owner');
      return;
    }
    const card = await myCard().catch(() => null);
    if (!card) {
      router.replace('/onboarding');
      return;
    }
    if (params.next) router.replace(params.next as never);
    else router.replace('/');
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const problem =
      mode === 'in'
        ? await signIn(phone, password)
        : await signUp({
            phone,
            password,
            displayName: name,
            role,
            venueName: role === 'venue_owner' ? venueName : undefined,
            venueArea: role === 'venue_owner' ? venueArea : undefined,
          });
    setBusy(false);
    if (problem) {
      setError(problem);
      return;
    }
    await land();
  };

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={10}
          onPress={() => router.back()}
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

      <View style={{ alignItems: 'center', paddingVertical: 4 }}>
        <VoidMark size={116} rings={2} />
      </View>

      <View style={{ gap: 8 }}>
        <Txt size={26} weight="bold" em={-0.02} color={onVoid.primary}>
          {mode === 'in' ? t.authEnter : t.authJoin}
        </Txt>
        <Txt size={13} lh={1.6} color={onVoid.muted}>
          {mode === 'in' ? t.authEnterBlurb : t.authJoinBlurb}
        </Txt>
      </View>

      {/* Joining as a player or as somewhere to play. One account either way. */}
      {mode === 'join' ? (
        <View style={{ gap: 10 }}>
          <Eyebrow>{t.authIAm}</Eyebrow>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Choice label={t.authAsPlayer} on={role === 'player'} onPress={() => setRole('player')} />
            <Choice
              label={t.authAsOwner}
              on={role === 'venue_owner'}
              onPress={() => setRole('venue_owner')}
            />
          </View>
        </View>
      ) : null}

      <View style={{ gap: 16 }}>
        {mode === 'join' ? (
          <Field
            label={t.authYourName}
            value={name}
            onChangeText={setName}
            placeholder="Basel Elsayed"
            autoComplete="name"
          />
        ) : null}

        <Field
          label={t.authMobile}
          value={phone}
          onChangeText={setPhone}
          placeholder="+20 100 000 0000"
          keyboardType="phone-pad"
          autoComplete="tel"
        />

        <Field
          label={t.authPassword}
          value={password}
          onChangeText={setPassword}
          placeholder={t.authPasswordHint}
          secureTextEntry
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
        />

        {mode === 'join' && role === 'venue_owner' ? (
          <>
            <Field
              label={t.authVenueName}
              value={venueName}
              onChangeText={setVenueName}
              placeholder="Stadium One"
            />
            <Field
              label={t.authVenueArea}
              value={venueArea}
              onChangeText={setVenueArea}
              placeholder="Nasr City"
            />
            {/* VEN-006: said here rather than discovered later. */}
            <Txt size={11.5} lh={1.6} color="rgba(243,238,229,.38)">
              {t.authVenuePending}
            </Txt>
          </>
        ) : null}
      </View>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <Button
        label={busy ? t.authWorking : mode === 'in' ? t.authSignIn : t.authCreate}
        height={52}
        round={radius.control}
        size={15}
        disabled={!ready || busy}
        onPress={submit}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={mode === 'in' ? t.authToJoin : t.authToSignIn}
        hitSlop={10}
        onPress={() => {
          setMode(mode === 'in' ? 'join' : 'in');
          setError(null);
        }}
      >
        <Txt size={12.5} weight="semibold" color={gold.base} align="center">
          {mode === 'in' ? t.authToJoin : t.authToSignIn}
        </Txt>
      </Pressable>

      {/* AUTH-004: acceptance is recorded against a version. */}
      {mode === 'join' ? (
        <Txt size={11.5} lh={1.6} color="rgba(243,238,229,.38)">
          {t.authTerms}
        </Txt>
      ) : null}

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
        autoCapitalize="none"
        accessibilityLabel={label}
        {...input}
        style={{
          height: 52,
          borderRadius: radius.control,
          borderWidth: 1,
          borderColor: goldAlpha.edge,
          backgroundColor: void_.surface,
          paddingHorizontal: 16,
          color: onVoid.primary,
          fontFamily: face.semibold,
          fontSize: 16,
        }}
      />
    </View>
  );
}

function Choice({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        flex: 1,
        height: 46,
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: on ? gold.base : goldAlpha.edge,
        backgroundColor: on ? 'rgba(198,163,75,.14)' : void_.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt size={13.5} weight="semibold" color={on ? gold.base : onVoid.secondary}>
        {label}
      </Txt>
    </Pressable>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
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
        {children}
      </Txt>
    </View>
  );
}
