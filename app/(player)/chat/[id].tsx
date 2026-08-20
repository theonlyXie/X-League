import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { LanguageCorner } from '@/components/LanguageCorner';
import { useI18n } from '@/i18n';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { useMessages } from '@/state/messages';
import { useProfile } from '@/state/profile';

/**
 * P-11 / P-12 / P-14 Thread — structured match conversation.
 */
export default function ChatThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { card } = useProfile();
  const { linesFor, send, markRead, threadById } = useMessages();
  const thread = threadById(id ?? '') ?? threadById('xl-7k42');
  const lines = linesFor(thread?.id ?? 'xl-7k42');
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (thread?.id) markRead(thread.id);
  }, [thread?.id, markRead]);

  useEffect(() => {
    const tmr = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(tmr);
  }, [lines.length]);

  if (!thread) {
    return (
      <View style={{ flex: 1, backgroundColor: void_.bg, paddingTop: insets.top, padding: 20 }}>
        <LanguageCorner />
        <Txt color={onVoid.primary}>{t('chat.empty')}</Txt>
      </View>
    );
  }

  const kindDetail =
    thread.kind === 'match'
      ? t('chat.kindMatchDetail')
      : thread.kind === 'venue'
        ? t('chat.kindVenueDetail')
        : t('chat.kindCupDetail');

  const onSend = () => {
    const text = draft.trim();
    if (!text) return;
    send(thread.id, text, card.initials);
    setDraft('');
  };

  return (
    <View style={{ flex: 1, backgroundColor: void_.bg, paddingTop: insets.top }}>
      <LanguageCorner />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 44 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
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
              <Txt size={17} weight="bold" em={-0.02} color={onVoid.primary} numberOfLines={1}>
                {thread.title}
              </Txt>
              <Txt size={11.5} color={onVoid.faint}>
                {kindDetail}
              </Txt>
            </View>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16, gap: 10 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
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
        </ScrollView>

        <View
          style={{
            flexDirection: 'row',
            gap: 8,
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 12),
            borderTopWidth: 1,
            borderTopColor: onVoid.edgeFaint,
            backgroundColor: void_.chrome,
          }}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t('chat.placeholder')}
            placeholderTextColor={onVoid.dim}
            accessibilityLabel={t('chat.placeholder')}
            onSubmitEditing={onSend}
            returnKeyType="send"
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
          <Button label={t('chat.send')} width={72} onPress={onSend} disabled={!draft.trim()} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
