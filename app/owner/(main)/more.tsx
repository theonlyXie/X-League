import { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { Txt } from '@/components/Txt';
import { useI18n } from '@/i18n';
import { ink, onOperative, operative, radius } from '@/theme/tokens';
import { OWNER_REPORTS, PITCHES, STAFF } from '@/data/ownerOps';
import { useProfile } from '@/state/profile';

/**
 * O-05–O-08 Staff, pitches, reports and settings on one More surface.
 */
export default function OwnerMore() {
  const router = useRouter();
  const { t } = useI18n();
  const { replayOnboarding } = useProfile();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: operative.bg }}
      contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 28, gap: 22 }}
      showsVerticalScrollIndicator={false}
    >
      <Section title={t('owner.staff')}>
        {STAFF.map((s) => (
          <Row key={s.name} title={s.name} detail={`${s.role} · ${s.pin}`} />
        ))}
      </Section>

      <Section title={t('owner.pitches')}>
        {PITCHES.map((p) => (
          <Row
            key={p.name}
            title={`${p.name} · ${t('common.egp')} ${p.hourly}/hr`}
            detail={`${p.surface} · ${p.note}`}
          />
        ))}
      </Section>

      <Section title={t('owner.reports')}>
        {OWNER_REPORTS.map((r) => (
          <Row key={r.label} title={`${r.label} · ${r.value}`} detail={r.detail} />
        ))}
      </Section>

      <Section title={t('owner.settings')}>
        <View style={moreRow}>
          <LanguageSwitch surface="operative" />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('owner.replayOnboarding')}
          onPress={async () => {
            await replayOnboarding();
            router.replace('/onboarding');
          }}
          style={moreRow}
        >
          <View style={{ flex: 1, gap: 3 }}>
            <Txt size={14} weight="semibold" color={ink}>
              {t('owner.replayOnboarding')}
            </Txt>
            <Txt size={12} color={onOperative.muted}>
              {t('owner.replayDetail')}
            </Txt>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('owner.openAdmin')}
          onPress={() => router.push('/admin')}
          style={moreRow}
        >
          <View style={{ flex: 1, gap: 3 }}>
            <Txt size={14} weight="semibold" color={ink}>
              {t('owner.openAdmin')}
            </Txt>
            <Txt size={12} color={onOperative.muted}>
              {t('me.adminDetail')}
            </Txt>
          </View>
        </Pressable>
      </Section>
    </ScrollView>
  );
}

const moreRow = {
  paddingVertical: 12,
  paddingHorizontal: 14,
  borderRadius: radius.dense,
  backgroundColor: operative.surface,
  borderWidth: 1,
  borderColor: onOperative.hairline,
} as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Txt size={10} weight="semibold" em={0.16} upper color={onOperative.faint}>
        {title}
      </Txt>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

function Row({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={moreRow}>
      <Txt size={14} weight="semibold" color={ink}>
        {title}
      </Txt>
      <Txt size={12} color={onOperative.muted} style={{ marginTop: 3 }}>
        {detail}
      </Txt>
    </View>
  );
}
