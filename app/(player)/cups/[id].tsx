import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Eyebrow } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { CUP_FIXTURES, CUP_RULES, CUPS, GROUP_A } from '@/data/cups';

/**
 * P-16–P-20 Tournament detail — standings, fixtures and eligibility.
 */
export default function CupDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const cup = CUPS.find((c) => c.id === id) ?? CUPS[0];

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/cups'))}
          hitSlop={8}
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
        <View style={{ flex: 1, gap: 2 }}>
          <Txt size={19} weight="bold" em={-0.02} color={onVoid.primary}>
            {cup.name}
          </Txt>
          <Txt size={11.5} color={onVoid.faint}>
            {cup.stage} · {cup.prize}
          </Txt>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <Eyebrow>Group A</Eyebrow>
        <View
          style={{
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: onVoid.edge,
            overflow: 'hidden',
            backgroundColor: void_.surface,
          }}
        >
          <View style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 14, gap: 8 }}>
            <Txt size={10} weight="bold" em={0.08} color={onVoid.dim} style={{ flex: 1 }}>
              TEAM
            </Txt>
            {['P', 'GD', 'PTS'].map((h) => (
              <Txt key={h} size={10} weight="bold" em={0.08} color={onVoid.dim} style={{ width: 28, textAlign: 'right' }}>
                {h}
              </Txt>
            ))}
          </View>
          {GROUP_A.map((row) => (
            <View
              key={row.team}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 11,
                paddingHorizontal: 14,
                borderTopWidth: 1,
                borderTopColor: onVoid.edgeFaint,
                backgroundColor: row.you ? goldAlpha.fillSoft : 'transparent',
                gap: 8,
              }}
            >
              <Txt size={13} weight={row.you ? 'bold' : 'medium'} color={row.you ? gold.base : onVoid.primary} style={{ flex: 1 }}>
                {row.team}
                {row.you ? ' · you' : ''}
              </Txt>
              <Txt size={12} color={onVoid.muted} style={{ width: 28, textAlign: 'right' }}>
                {row.p}
              </Txt>
              <Txt size={12} color={onVoid.muted} style={{ width: 28, textAlign: 'right' }}>
                {row.gd > 0 ? `+${row.gd}` : row.gd}
              </Txt>
              <Txt size={13} weight="bold" color={onVoid.primary} style={{ width: 28, textAlign: 'right' }}>
                {row.pts}
              </Txt>
            </View>
          ))}
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <Eyebrow>Fixtures</Eyebrow>
        {CUP_FIXTURES.map((fx) => (
          <View
            key={fx.when + fx.home}
            style={{
              padding: 14,
              borderRadius: radius.row,
              backgroundColor: void_.surface,
              borderWidth: 1,
              borderColor: fx.live ? goldAlpha.edge : onVoid.edge,
              gap: 6,
            }}
          >
            <Txt size={10} weight="bold" em={0.14} color={fx.live ? gold.base : onVoid.dim}>
              {fx.live ? 'Tonight' : fx.when}
            </Txt>
            <Txt size={15} weight="semibold" color={onVoid.primary}>
              {fx.home} vs {fx.away}
            </Txt>
            <Txt size={12} color={onVoid.faint}>
              {fx.pitch}
            </Txt>
          </View>
        ))}
      </View>

      <Txt size={12} lh={1.5} color={onVoid.dim}>
        {CUP_RULES}
      </Txt>

      <Button label="Match lobby" onPress={() => router.push('/play/lobby')} />
    </Screen>
  );
}
