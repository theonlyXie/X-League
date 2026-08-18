import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Eyebrow } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { VoidMark } from '@/components/VoidMark';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { face, mono } from '@/theme/typography';
import { useSession } from '@/state/session';
import { myCard } from '@/data/api';

/**
 * P-01 Onboarding, the sign-in step.
 *
 * AUTH-001: a verified mobile number and a one-time password. This is the gate
 * everything privileged sits behind; a verified number with no card yet
 * continues into the anchored assessment on `/onboarding`.
 */
export default function SignIn() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();
  const { requestOtp, verifyOtp } = useSession();

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('+20');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneLooksUsable = /^\+\d{9,15}$/.test(phone.replace(/\s/g, ''));

  const send = async () => {
    setBusy(true);
    setError(null);
    const problem = await requestOtp(phone.replace(/\s/g, ''));
    setBusy(false);
    if (problem) {
      setError(problem);
      return;
    }
    setStep('code');
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const problem = await verifyOtp(phone.replace(/\s/g, ''), code.trim());
    setBusy(false);
    if (problem) {
      setError(problem);
      return;
    }
    // A verified number with no card yet means onboarding is unfinished, so
    // finish it rather than dropping them somewhere that shows no identity.
    const card = await myCard().catch(() => null);
    if (!card) {
      router.replace('/onboarding');
      return;
    }
    if (params.next) router.replace(params.next as never);
    else router.replace('/');
  };

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={10}
          onPress={() => (step === 'code' ? setStep('phone') : router.back())}
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

      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <VoidMark size={132} rings={2} />
      </View>

      {step === 'phone' ? (
        <View style={{ gap: 20 }}>
          <View style={{ gap: 8 }}>
            <Txt size={26} weight="bold" em={-0.02} color={onVoid.primary}>
              Enter the league
            </Txt>
            <Txt size={13} lh={1.6} color={onVoid.muted}>
              We'll text you a six-digit code. Your number stays private — venues
              and other players never see it.
            </Txt>
          </View>

          <View style={{ gap: 10 }}>
            <Eyebrow>Mobile number</Eyebrow>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+20 100 000 0000"
              placeholderTextColor="rgba(243,238,229,.25)"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              accessibilityLabel="Mobile number"
              style={{
                height: 54,
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: goldAlpha.edge,
                backgroundColor: void_.surface,
                paddingHorizontal: 16,
                color: onVoid.primary,
                fontFamily: face.semibold,
                fontSize: 17,
                letterSpacing: 0.5,
              }}
            />
          </View>

          {error ? <ErrorNote>{error}</ErrorNote> : null}

          <Button
            label={busy ? 'Sending…' : 'Send code'}
            height={52}
            round={radius.control}
            size={15}
            disabled={!phoneLooksUsable || busy}
            onPress={send}
          />

          {/* AUTH-004: acceptance is recorded against a version. */}
          <Txt size={11.5} lh={1.6} color="rgba(243,238,229,.38)">
            By continuing you accept the X League terms and privacy notice. You
            must be 18 or over to play.
          </Txt>
        </View>
      ) : (
        <View style={{ gap: 20 }}>
          <View style={{ gap: 8 }}>
            <Txt size={26} weight="bold" em={-0.02} color={onVoid.primary}>
              Check your messages
            </Txt>
            <Txt size={13} lh={1.6} color={onVoid.muted}>
              We sent a code to {phone}.{' '}
              <Txt size={13} weight="semibold" color={gold.base} onPress={() => setStep('phone')}>
                Change number
              </Txt>
            </Txt>
          </View>

          <View style={{ gap: 10 }}>
            <Eyebrow>Six-digit code</Eyebrow>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              placeholderTextColor="rgba(243,238,229,.2)"
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              accessibilityLabel="Six-digit code"
              style={{
                height: 60,
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: code.length === 6 ? gold.base : goldAlpha.edge,
                backgroundColor: void_.surface,
                paddingHorizontal: 16,
                color: gold.base,
                fontFamily: mono,
                fontSize: 26,
                letterSpacing: 10,
                textAlign: 'center',
              }}
            />
          </View>

          {error ? <ErrorNote>{error}</ErrorNote> : null}

          <Button
            label={busy ? 'Verifying…' : 'Verify and continue'}
            height={52}
            round={radius.control}
            size={15}
            disabled={code.length !== 6 || busy}
            onPress={verify}
          />

          <Pressable accessibilityRole="button" accessibilityLabel="Send the code again" onPress={send} hitSlop={10}>
            <Txt size={12.5} weight="semibold" color={onVoid.faint} align="center">
              Didn't get it? Send again
            </Txt>
          </Pressable>
        </View>
      )}

      {busy ? <ActivityIndicator color={gold.base} /> : null}
    </Screen>
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
