import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';
import { TextInput } from '@/components/TextField';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Eyebrow } from '@/components/ui';
import { ArrowLeft, Check } from '@/components/icons';
import { VoidMark } from '@/components/VoidMark';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { face } from '@/theme/typography';
import { useSession } from '@/state/session';
import { useI18n } from '@/i18n';
import { myCard } from '@/data/api';
import { myVenues } from '@/data/manage';
import { COUNTRY_CODE, isEgyptianMobile, nationalDigits, toE164 } from '@/lib/phone';
import { PRIVACY_URL, TERMS_URL, legalConfigured } from '@/lib/legal';

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
  const { signIn, signUp, browseAsGuest } = useSession();
  const { reason, t } = useI18n();

  // `canGoBack` is false on the launch that starts here, and true when this
  // was opened from somewhere — a cup entry, the account screen — which is
  // exactly the difference between the door and a detour.
  const canLeave = router.canGoBack();

  const [mode, setMode] = useState<Mode>('in');
  const [role, setRole] = useState<Role>('player');
  // The national part only. The country code is fixed beside the field, so
  // this never holds one and the value sent to the server is assembled once,
  // in one place, rather than depending on how somebody typed it.
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [venueName, setVenueName] = useState('');
  const [venueArea, setVenueArea] = useState('');
  // Said out loud rather than buried in a sentence nobody reads. The terms
  // put the age at 18, the store rating has to agree with that, and a
  // confirmation somebody actually ticked is the only version of it that means
  // anything.
  const [over18, setOver18] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A real Egyptian mobile, not merely "enough digits". The old test accepted
  // eight of anything, which passed `+20` followed by five stray characters
  // straight through to GoTrue.
  const phoneUsable = isEgyptianMobile(phone);
  const ready =
    mode === 'in'
      ? phoneUsable && password.length >= 8
      : phoneUsable &&
        password.length >= 8 &&
        name.trim().length >= 2 &&
        over18 &&
        (role === 'player' || (venueName.trim().length >= 2 && venueArea.trim().length >= 2));

  /**
   * Where somebody lands once they are in.
   *
   * A venue owner goes to their console — on the way *in* as well as on the way
   * through sign-up. The owner test used to be `mode === 'join'`, so somebody
   * who registered a venue on Tuesday and signed back in on Wednesday was sent
   * to the player card assessment and asked which position they play before
   * they could reach their own venue. Venue staff are recognised by the venues
   * they staff, not by which screen they happened to arrive from.
   *
   * A player with no card yet does have unfinished onboarding, and dropping
   * them on a home screen that shows no identity would look broken rather than
   * new — so that redirect stays, for players.
   */
  const land = async () => {
    if (mode === 'join' && role === 'venue_owner') {
      router.replace('/owner');
      return;
    }
    const [card, venues] = await Promise.all([
      myCard().catch(() => null),
      myVenues().catch(() => []),
    ]);
    if (venues.length > 0) {
      router.replace('/owner');
      return;
    }
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
        ? await signIn(toE164(phone), password)
        : await signUp({
            phone: toE164(phone),
            password,
            displayName: name,
            role,
            venueName: role === 'venue_owner' ? venueName : undefined,
            venueArea: role === 'venue_owner' ? venueArea : undefined,
          });
    setBusy(false);
    if (problem) {
      // `signIn` and `signUp` hand back whatever the server said. Most of it is
      // already translated by `explain`; a refusal that came straight out of a
      // function is not, and goes through the same table as every other one.
      setError(reason(problem) ?? problem);
      return;
    }
    await land();
  };

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 22 }}>
      {/* This screen is now where the app starts, so on a fresh launch there
          is nothing behind it. A back arrow that does nothing is worse than no
          arrow: it says a way out exists. The way out is the link at the
          bottom. The arrow returns when somebody arrived here from a screen. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 34 }}>
        {canLeave ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.back}
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
        ) : null}
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
          prefix={COUNTRY_CODE}
          value={phone}
          // Normalised on the way in rather than on submit, so a pasted
          // `+20 101 234 5678` or a habitual leading zero corrects itself in
          // front of the person typing instead of failing later.
          onChangeText={(text) => setPhone(nationalDigits(text))}
          placeholder="100 000 0000"
          hint={t.authMobileHint}
          keyboardType="phone-pad"
          // No `maxLength`. It caps the raw text before `nationalDigits` ever
          // sees it, so typing the habitual leading zero lost the last digit
          // and a pasted international number was truncated to nonsense. The
          // ten-digit limit belongs in the normaliser, which applies it after
          // the country code and trunk zero have been taken off.
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

      {/* The one way past the door, for somebody who wants to see what is on
          before handing over a number. The cups, the boards and the venues are
          readable without an account by design; everything with their name on
          it asks them to sign in when they reach it. */}
      {!canLeave ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.authBrowse}
          hitSlop={10}
          onPress={() => {
            browseAsGuest();
            router.replace('/');
          }}
        >
          <Txt size={12.5} weight="semibold" color={onVoid.muted} align="center">
            {t.authBrowse}
          </Txt>
        </Pressable>
      ) : null}

      {/* AUTH-004: acceptance is recorded against a version. The documents are
          published and linked now, because a sentence promising terms with
          nothing to tap is what a reviewer reads as a missing document. */}
      {mode === 'join' ? (
        <View style={{ gap: 10 }}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: over18 }}
            accessibilityLabel={t.over18}
            onPress={() => setOver18((on) => !on)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: over18 ? gold.base : goldAlpha.edge,
                backgroundColor: over18 ? 'rgba(198,163,75,.16)' : void_.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {over18 ? <Check size={13} color={gold.base} /> : null}
            </View>
            <Txt size={13} color={onVoid.secondary}>
              {t.over18}
            </Txt>
          </Pressable>

          <Txt size={11.5} lh={1.6} color="rgba(243,238,229,.38)">
            {t.authTerms}
          </Txt>

          {legalConfigured ? (
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={t.termsLink}
                hitSlop={8}
                onPress={() => void Linking.openURL(TERMS_URL)}
              >
                <Txt size={12} weight="semibold" color={gold.base}>
                  {t.termsLink}
                </Txt>
              </Pressable>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={t.privacyLink}
                hitSlop={8}
                onPress={() => void Linking.openURL(PRIVACY_URL)}
              >
                <Txt size={12} weight="semibold" color={gold.base}>
                  {t.privacyLink}
                </Txt>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {busy ? <ActivityIndicator color={gold.base} /> : null}
    </Screen>
  );
}

function Field({
  label,
  prefix,
  hint,
  ...input
}: { label: string; prefix?: string; hint?: string } & React.ComponentProps<typeof TextInput>) {
  // The row's direction comes from the language, not from the process. Native
  // mirroring only changes on a restart, and until it does an English speaker
  // was reading `+20` on the wrong side of their own number.
  const { rtl } = useI18n();
  const box = {
    height: 52,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: goldAlpha.edge,
    backgroundColor: void_.surface,
  } as const;

  const text = {
    color: onVoid.primary,
    fontFamily: face.semibold,
    fontSize: 16,
  } as const;

  return (
    <View style={{ gap: 8 }}>
      <Eyebrow>{label}</Eyebrow>

      {prefix ? (
        // The affix sits inside the field's border rather than beside it, so
        // the two read as one control: the number is `+20 100 000 0000`, not a
        // label and a number that happen to be adjacent.
        <View
          style={{
            ...box,
            flexDirection: rtl ? 'row-reverse' : 'row',
            alignItems: 'center',
          }}
        >
          <View
            style={{
              paddingHorizontal: 14,
              height: '100%',
              justifyContent: 'center',
              borderRightWidth: rtl ? 0 : 1,
              borderLeftWidth: rtl ? 1 : 0,
              borderRightColor: goldAlpha.edge,
              borderLeftColor: goldAlpha.edge,
            }}
          >
            {/* Not a field. It cannot be edited, cleared or tabbed into,
                because every account here is Egyptian and a country code the
                person can delete is one they can delete by accident. */}
            <Txt size={16} weight="semibold" color={onVoid.secondary}>
              {prefix}
            </Txt>
          </View>
          <TextInput
            placeholderTextColor="rgba(243,238,229,.25)"
            autoCapitalize="none"
            accessibilityLabel={label}
            {...input}
            style={{
              ...text,
              flex: 1,
              height: '100%',
              paddingHorizontal: 14,
              // A phone number is read left to right in both languages, so it
              // is not mirrored with the rest of the interface.
              textAlign: 'left',
              writingDirection: 'ltr',
            }}
          />
        </View>
      ) : (
        <TextInput
          placeholderTextColor="rgba(243,238,229,.25)"
          autoCapitalize="none"
          accessibilityLabel={label}
          {...input}
          style={{ ...box, ...text, paddingHorizontal: 16 }}
        />
      )}

      {hint ? (
        <Txt size={11.5} color={onVoid.faint}>
          {hint}
        </Txt>
      ) : null}
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
