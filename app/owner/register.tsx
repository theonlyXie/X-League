import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Eyebrow } from '@/components/ui';
import { useI18n } from '@/i18n';
import { ink, onOperative, operative, radius } from '@/theme/tokens';
import { useProfile } from '@/state/profile';
import { useMyVenueSubmission } from '@/state/venues';

/**
 * Owner venue registration — submit name and wait for admin approval.
 */
export default function OwnerRegister() {
  const router = useRouter();
  const { t } = useI18n();
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
          {t('ownerRegister.alreadyTitle')}
        </Txt>
        <Txt size={14} color={onOperative.secondary}>
          {t('ownerRegister.alreadyBody', { name: mine.name })}
        </Txt>
        <Button label={t('ownerRegister.viewStatus')} variant="operative" onPress={() => router.replace('/owner/pending')} />
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
        <Eyebrow color={onOperative.faint}>{t('ownerRegister.kicker')}</Eyebrow>
        <Txt size={26} weight="bold" em={-0.02} color={ink}>
          {t('ownerRegister.title')}
        </Txt>
        <Txt size={14} lh={1.5} color={onOperative.secondary}>
          {t('ownerRegister.body')}
        </Txt>
      </View>

      <Field label={t('ownerRegister.venueName')} value={name} onChange={setName} placeholder="e.g. Stadium One" />
      <Field label={t('ownerRegister.area')} value={area} onChange={setArea} placeholder="e.g. Nasr City" />

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
          {t('ownerRegister.nextTitle')}
        </Txt>
        <Txt size={12} color={onOperative.muted} lh={1.45}>
          {t('ownerRegister.nextBody')}
        </Txt>
      </View>

      <Button
        label={busy ? t('ownerRegister.submitting') : t('ownerRegister.submit')}
        disabled={busy || !name.trim()}
        onPress={onSubmit}
      />
      <Button label={t('ownerRegister.backPlayer')} variant="ghost" onPress={() => router.replace('/')} />
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
