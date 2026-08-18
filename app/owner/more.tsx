import { ReactNode, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Txt } from '@/components/Txt';
import { ink, onOperative, operative, radius } from '@/theme/tokens';
import { OWNER_REPORTS, PITCHES, STAFF } from '@/data/ownerOps';
import { useOnboarding } from '@/state/onboarding';

/**
 * O-05–O-08 Staff, pitches, reports and settings on one More surface.
 */
export default function OwnerMore() {
  const router = useRouter();
  const { replay } = useOnboarding();
  const [rtl, setRtl] = useState(false);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: operative.bg }}
      contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 28, gap: 22 }}
      showsVerticalScrollIndicator={false}
    >
      <Section title="Staff · O-05">
        {STAFF.map((s) => (
          <Row key={s.name} title={s.name} detail={`${s.role} · ${s.pin}`} />
        ))}
      </Section>

      <Section title="Pitches · O-06">
        {PITCHES.map((p) => (
          <Row key={p.name} title={`${p.name} · EGP ${p.hourly}/hr`} detail={`${p.surface} · ${p.note}`} />
        ))}
      </Section>

      <Section title="Reports · O-07">
        {OWNER_REPORTS.map((r) => (
          <Row key={r.label} title={`${r.label} · ${r.value}`} detail={r.detail} />
        ))}
      </Section>

      <Section title="Settings · O-08">
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: rtl }}
          accessibilityLabel="Arabic layout"
          onPress={() => setRtl((v) => !v)}
          style={moreRow}
        >
          <View style={{ flex: 1, gap: 3 }}>
            <Txt size={14} weight="semibold" color={ink}>
              Arabic RTL
            </Txt>
            <Txt size={12} color={onOperative.muted}>
              {rtl ? 'On for this session — full translation ships with the API layer' : 'Off · English LTR'}
            </Txt>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Replay player onboarding"
          onPress={async () => {
            await replay();
            router.replace('/onboarding');
          }}
          style={moreRow}
        >
          <View style={{ flex: 1, gap: 3 }}>
            <Txt size={14} weight="semibold" color={ink}>
              Replay player onboarding
            </Txt>
            <Txt size={12} color={onOperative.muted}>
              P-01 self-assessment
            </Txt>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open admin console"
          onPress={() => router.push('/admin')}
          style={moreRow}
        >
          <View style={{ flex: 1, gap: 3 }}>
            <Txt size={14} weight="semibold" color={ink}>
              Admin console
            </Txt>
            <Txt size={12} color={onOperative.muted}>
              Platform operations · audited
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
