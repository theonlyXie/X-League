import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Txt } from './Txt';
import { Bell } from './icons';
import { gold, onVoid, radius, void_ } from '@/theme/tokens';
import { useI18n } from '@/i18n';
import { useUnread } from '@/state/unread';

/**
 * The way into notifications, from wherever you are.
 *
 * It used to be a row inside the Me screen with the count on the Me tab — so
 * seeing that something had arrived and actually reading it were two different
 * gestures, and the second one was a tab, a scroll and a tap. A count you
 * cannot act on from where you are told about it is an itch, not a
 * notification.
 *
 * Drawn on the four player screens rather than in a header, because this app
 * has no shared player header: each screen draws its own top row, and a bell
 * bolted to the corner of a screen that does not have one would sit at a
 * different height on each.
 *
 * The badge shows a count rather than a dot. "3 waiting" is a reason to press
 * it; a dot is only a reason to wonder.
 */
export function NotificationBell() {
  const router = useRouter();
  const { t, num } = useI18n();
  const { unread } = useUnread();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? t.notificationsWaiting(num(unread)) : t.notifications}
      onPress={() => router.push('/notifications')}
      // A 20px icon is smaller than a thumb. The padding, not the glyph, is
      // what the finger actually has to hit.
      hitSlop={10}
      style={{
        width: 38,
        height: 38,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: unread > 0 ? 'rgba(198,163,75,.3)' : onVoid.edgeFaint,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Bell size={19} color={unread > 0 ? gold.base : onVoid.muted} />

      {unread > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            minWidth: 17,
            height: 17,
            paddingHorizontal: 4,
            borderRadius: radius.pill,
            backgroundColor: gold.base,
            alignItems: 'center',
            justifyContent: 'center',
            // Against the screen behind it, so the badge reads as sitting on
            // top of the bell rather than merging with its edge.
            borderWidth: 2,
            borderColor: void_.bg,
          }}
        >
          <Txt size={9.5} weight="bold" color={void_.bg}>
            {num(Math.min(unread, 99))}
          </Txt>
        </View>
      ) : null}
    </Pressable>
  );
}
