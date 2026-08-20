import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Eyebrow } from '@/components/ui';
import { ink, onOperative, operative, radius } from '@/theme/tokens';
import { useProfile } from '@/state/profile';
import { useMyVenueSubmission } from '@/state/venues';

/**
 * Owner venue registration — submit name and wait for admin approval.
 */
export default function OwnerRegister() {
  const router = useRouter();
  const { profile } = useProfile();
  const { submitVenue, mine } = useMyVenueSubmission();
  const [name, setName] = useState('');
  const [area, setArea] = useState('Nasr City');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mine?.status === 'approved') router.replace('/owner');
  }, [mine?.status, router]);

  if (mine?.status === 'pending') {
    return (
      <Screen surface="operative" contentStyle={{ padding: 22, gap: 16 }}>
        <Txt size={22} weight="bold" color={ink}>
          Already submitted
        </Txt>
        <Txt size={14} color={onOperative.secondary}>
          {mine.name} is waiting for admin approval. You will get owner access once it is live.
        </Txt>
        <Button label="View status" variant="operative" onPress={() => router.replace('/owner/pending')} />
      </Screen>
    );
  }

  if (mine?.status === 'approved') return null;

  const onSubmit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await submitVenue(name, area, profile.firstName);
    setBusy(false);
    router.replace('/owner/pending');
  };

  return (
    <Screen surface="operative" contentStyle={{ paddingTop: 18, paddingHorizontal: 22, paddingBottom: 32, gap: 20 }}>
      <View style={{ gap: 6 }}>
        <Eyebrow color={onOperative.faint}>Owner signup</Eyebrow>
        <Txt size={26} weight="bold" em={-0.02} color={ink}>
          Register your venue
        </Txt>
        <Txt size={14} lh={1.5} color={onOperative.secondary}>
          Add your venue name and wait for X League ops to approve the listing. Until then, it will not appear in player search.
        </Txt>
      </View>

      <Field label="Venue name" value={name} onChange={setName} placeholder="e.g. Stadium One" />
      <Field label="Area" value={area} onChange={setArea} placeholder="e.g. Nasr City" />

      <View
        style={{
          padding: 14,
          borderRadius: radius.panel,
          backgroundColor: operative.surface,
          borderWidth: 1,
          borderColor: onOperative.hairline,
          gap: 6,
        }}
      >
        <Txt size={12} weight="semibold" color={ink}>
          What happens next
        </Txt>
        <Txt size={12} color={onOperative.muted} lh={1.45}>
          1. Admin reviews your submission{'\n'}2. On approval, your venue goes live in Play search{'\n'}3. You get the owner calendar and bookings desk
        </Txt>
      </View>

      <Button label={busy ? 'Submitting…' : 'Submit for approval'} disabled={busy || !name.trim()} onPress={onSubmit} />
      <Button label="Back to player mode" variant="ghost" onPress={() => router.replace('/')} />
    </Screen>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Txt size={11} weight="semibold" em={0.12} upper color={onOperative.faint}>
        {label}
      </Txt>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={onOperative.dim}
        style={{
          height: 48,
          borderRadius: radius.dense,
          borderWidth: 1,
          borderColor: onOperative.line,
          paddingHorizontal: 14,
          fontSize: 15,
          color: ink,
          backgroundColor: operative.surface,
        }}
      />
    </View>
  );
}
