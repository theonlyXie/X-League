import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { THREAD_MESSAGES, THREADS, ChatLine } from '@/data/chat';

/**
 * P-11 / P-12 / P-14 Thread — structured match conversation.
 */
export default function ChatThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const thread = THREADS.find((t) => t.id === id) ?? THREADS[0];
  const [lines, setLines] = useState<ChatLine[]>(THREAD_MESSAGES[thread.id] ?? []);
  const [draft, setDraft] = useState('');

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setLines((prev) => [
      ...prev,
      { id: String(prev.length + 1), from: 'you', initials: 'BE', text, at: 'now' },
    ]);
    setDraft('');
  };

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/chat'))}
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
          <Txt size={18} weight="bold" em={-0.02} color={onVoid.primary}>
            {thread.title}
          </Txt>
          <Txt size={11.5} color={onVoid.faint}>
            {thread.kind === 'match' ? 'Match lobby' : thread.kind === 'venue' ? 'Venue desk' : 'Competition'}
          </Txt>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        {lines.map((line) => {
          const mine = line.from === 'you';
          return (
            <View key={line.id} style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
              <View
                style={{
                  maxWidth: '86%',
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: radius.row,
                  backgroundColor: mine ? goldAlpha.fill : void_.surface,
                  borderWidth: 1,
                  borderColor: mine ? goldAlpha.edge : onVoid.edge,
                  gap: 4,
                }}
              >
                {!mine ? (
                  <Txt size={10} weight="bold" em={0.12} color={gold.base}>
                    {line.initials}
                  </Txt>
                ) : null}
                <Txt size={13.5} lh={1.4} color={onVoid.primary}>
                  {line.text}
                </Txt>
                <Txt size={10} color={onVoid.dim}>
                  {line.at}
                </Txt>
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message this thread"
          placeholderTextColor={onVoid.dim}
          accessibilityLabel="Message"
          style={{
            flex: 1,
            height: 44,
            borderRadius: radius.row,
            borderWidth: 1,
            borderColor: onVoid.hairline,
            paddingHorizontal: 14,
            color: onVoid.primary,
            fontSize: 14,
            fontFamily: 'Inter_400Regular',
          }}
        />
        <Button label="Send" width={72} onPress={send} />
      </View>
    </Screen>
  );
}
