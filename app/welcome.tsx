import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Dimensions, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Txt } from '@/components/Txt';
import { ActionButton, PitchArt } from '@/components/kit';
import { VoidMark } from '@/components/VoidMark';
import { Trophy } from '@/components/icons';
import { TopBar } from '@/components/TopBar';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { useI18n } from '@/i18n';
import { WELCOME_SEEN } from '@/lib/welcome';

/**
 * The first launch: three cards, then the door.
 *
 * The redesign opens on a photographic carousel. X League has no photographs
 * of its own yet and will not borrow somebody else's, so each card is drawn —
 * a pitch, the mark, a cup — in the same gold on the same void as everything
 * after it.
 *
 * Seen once. `_layout`'s gate sends a first launch here and every launch after
 * it straight to sign-in, on the strength of the flag written below.
 */
export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const scroller = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const width = Dimensions.get('window').width;

  const slides = [
    { title: t.welcomeFindTitle, body: t.welcomeFindBody, art: <PitchArt height={260} round={radius.signature} /> },
    {
      title: t.welcomePlayTitle,
      body: t.welcomePlayBody,
      art: (
        <View style={{ height: 260, alignItems: 'center', justifyContent: 'center' }}>
          <VoidMark size={220} glow />
        </View>
      ),
    },
    {
      title: t.welcomeWinTitle,
      body: t.welcomeWinBody,
      art: (
        <View
          style={{
            height: 260,
            borderRadius: radius.signature,
            borderWidth: 1,
            borderColor: goldAlpha.edge,
            backgroundColor: goldAlpha.fillSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Trophy size={132} color={gold.base} />
        </View>
      ),
    },
  ];

  const done = () => {
    AsyncStorage.setItem(WELCOME_SEEN, '1').catch(() => {});
    router.replace('/sign-in');
  };

  const next = () => {
    if (page >= slides.length - 1) return done();
    scroller.current?.scrollTo({ x: (page + 1) * width, animated: true });
    setPage(page + 1);
  };

  return (
    <View style={{ flex: 1, backgroundColor: void_.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}>
      {/* The language switch, because this is the first thing anybody sees
          and the app opens in Arabic. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 20 }}>
        <TopBar />
        <Pressable accessibilityRole="button" accessibilityLabel={t.skip} hitSlop={12} onPress={done}>
          <Txt size={13.5} weight="semibold" color={onVoid.muted}>
            {t.skip}
          </Txt>
        </Pressable>
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={{ flex: 1 }}
      >
        {slides.map((s, i) => (
          <View key={i} style={{ width, paddingHorizontal: 24, justifyContent: 'center', gap: 32 }}>
            {s.art}
            <View style={{ gap: 12, alignItems: 'center' }}>
              <Txt size={28} weight="bold" em={-0.02} align="center" color={onVoid.primary}>
                {s.title}
              </Txt>
              <Txt size={14.5} lh={1.55} align="center" color={onVoid.muted}>
                {s.body}
              </Txt>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, gap: 22 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={{
                width: i === page ? 22 : 7,
                height: 7,
                borderRadius: radius.pill,
                backgroundColor: i === page ? gold.base : 'rgba(198,163,75,.3)',
              }}
            />
          ))}
        </View>
        <ActionButton label={page >= slides.length - 1 ? t.getStarted : t.next} onPress={next} />
      </View>
    </View>
  );
}
