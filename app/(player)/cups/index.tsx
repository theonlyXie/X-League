import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Eyebrow } from '@/components/ui';
import { ChevronRight } from '@/components/icons';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { CUPS } from '@/data/cups';

/**
 * P-15 Cups index — competition as a reason to return (§4.3).
 */
export default function Cups() {
  const router = useRouter();

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 18 }}>
      <View style={{ gap: 4 }}>
        <Txt size={22} weight="bold" em={-0.02} color={onVoid.primary}>
          Cups
        </Txt>
        <Txt size={13} color={onVoid.faint}>
          Verified play only. Walkovers after ten minutes.
        </Txt>
      </View>

      {CUPS.map((cup) => (
        <Pressable
          key={cup.id}
          accessibilityRole="button"
          accessibilityLabel={`${cup.name}, ${cup.stage}`}
          onPress={() => router.push(`/cups/${cup.id}`)}
          style={({ pressed }) => ({
            padding: 16,
            borderRadius: radius.cardInner,
            backgroundColor: void_.surface,
            borderWidth: 1,
            borderColor: cup.status === 'live' ? goldAlpha.edge : pressed ? goldAlpha.edge : onVoid.edge,
            gap: 10,
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Eyebrow color={cup.status === 'live' ? gold.base : onVoid.dim}>
              {cup.status === 'live' ? 'Live tonight' : cup.status === 'open' ? 'Entries open' : 'Soon'}
            </Eyebrow>
            <ChevronRight size={16} color={onVoid.dim} />
          </View>
          <Txt size={18} weight="bold" em={-0.02} color={onVoid.primary}>
            {cup.name}
          </Txt>
          <Txt size={12.5} color={onVoid.secondary}>
            {cup.format} · {cup.area}
          </Txt>
          <Txt size={12} color={onVoid.faint}>
            {cup.next}
          </Txt>
        </Pressable>
      ))}
    </Screen>
  );
}
