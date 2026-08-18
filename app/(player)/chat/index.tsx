import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { KIND_LABEL, THREADS } from '@/data/chat';

/**
 * P-10 Inbox — match, venue and cup threads only (§4.3).
 */
export default function ChatInbox() {
  const router = useRouter();

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 14 }}>
      <View style={{ gap: 4 }}>
        <Txt size={22} weight="bold" em={-0.02} color={onVoid.primary}>
          Chat
        </Txt>
        <Txt size={13} color={onVoid.faint}>
          Lobbies, venue desks and cups. Not a social feed.
        </Txt>
      </View>

      {THREADS.map((thread) => (
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
            <Txt size={10} weight="bold" em={0.08} color={gold.base}>
              {KIND_LABEL[thread.kind]}
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
      ))}
    </Screen>
  );
}
