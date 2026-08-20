import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useI18n } from '@/i18n';
import type { I18nKey } from '@/i18n';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import type { ThreadKind } from '@/data/chat';
import { useMessages } from '@/state/messages';

const FILTERS: { id: 'all' | ThreadKind; key: I18nKey }[] = [
  { id: 'all', key: 'chat.filterAll' },
  { id: 'match', key: 'chat.filterMatch' },
  { id: 'venue', key: 'chat.filterVenue' },
  { id: 'cup', key: 'chat.filterCup' },
];

/**
 * P-10 Inbox — match, venue and cup threads only (§4.3).
 */
export default function ChatInbox() {
  const router = useRouter();
  const { t } = useI18n();
  const { threads, unreadTotal } = useMessages();
  const [filter, setFilter] = useState<'all' | ThreadKind>('all');

  const rows = useMemo(
    () => (filter === 'all' ? threads : threads.filter((th) => th.kind === filter)),
    [threads, filter],
  );

  const kindLabel = (kind: ThreadKind) =>
    kind === 'match' ? t('chat.kindMatch') : kind === 'venue' ? t('chat.kindVenue') : t('chat.kindCup');

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 14 }}>
      <View style={{ gap: 4, paddingRight: 48 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Txt size={22} weight="bold" em={-0.02} color={onVoid.primary}>
              {t('chat.title')}
            </Txt>
            {unreadTotal > 0 ? (
              <Txt size={12} weight="semibold" color={gold.base}>
                {unreadTotal}
              </Txt>
            ) : null}
          </View>
          <Txt size={13} color={onVoid.faint}>
            {t('chat.subtitle')}
          </Txt>
        </View>

        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => {
            const on = f.id === filter;
            return (
              <Pressable
                key={f.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setFilter(f.id)}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: radius.denseChip,
                  ...(on
                    ? { backgroundColor: gold.base }
                    : { borderWidth: 1, borderColor: onVoid.hairline }),
                }}
              >
                <Txt size={11.5} weight="semibold" color={on ? void_.bg : onVoid.secondary}>
                  {t(f.key)}
                </Txt>
              </Pressable>
            );
          })}
        </View>

        {rows.length === 0 ? (
          <View
            style={{
              padding: 18,
              borderRadius: radius.control,
              borderWidth: 1,
              borderColor: onVoid.edge,
              backgroundColor: void_.surface,
            }}
          >
            <Txt size={14} color={onVoid.muted}>
              {t('chat.empty')}
            </Txt>
          </View>
        ) : (
          rows.map((thread) => (
            <Pressable
              key={thread.id}
              accessibilityRole="button"
              accessibilityLabel={`${thread.title}. ${thread.preview}`}
              onPress={() => router.push(`/chat/${thread.id}`)}
              style={({ pressed }) => ({
                padding: 14,
                borderRadius: radius.control,
                backgroundColor: void_.surface,
                borderWidth: 1,
                borderColor: thread.unread ? goldAlpha.edgeSoft : pressed ? goldAlpha.edge : onVoid.edgeFaint,
                flexDirection: 'row',
                gap: 12,
                alignItems: 'flex-start',
              })}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: radius.pill,
                  backgroundColor: void_.inset,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Txt size={9} weight="bold" em={0.06} color={gold.base}>
                  {kindLabel(thread.kind)}
                </Txt>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Txt size={14.5} weight="semibold" color={onVoid.primary} style={{ flex: 1 }} numberOfLines={1}>
                    {thread.title}
                  </Txt>
                  <Txt size={11} color={onVoid.dim}>
                    {thread.when}
                  </Txt>
                </View>
                <Txt size={12.5} color={onVoid.faint} numberOfLines={2}>
                  {thread.preview}
                </Txt>
              </View>
              {thread.unread ? (
                <View
                  style={{
                    minWidth: 18,
                    height: 18,
                    borderRadius: radius.pill,
                    backgroundColor: gold.base,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 5,
                    marginTop: 2,
                  }}
                >
                  <Txt size={10} weight="bold" color={void_.bg}>
                    {thread.unread}
                  </Txt>
                </View>
              ) : null}
            </Pressable>
          ))
        )}
    </Screen>
  );
}
