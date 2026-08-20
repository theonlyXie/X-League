import { Alert } from 'react-native';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Eyebrow } from '@/components/ui';
import { ArrowLeft } from '@/components/icons';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { BOOKING, LOBBY_CHAT, RosterEntry } from '@/data/player';
import { useI18n } from '@/i18n';
import { useBooking } from '@/state/booking';
import { useMessages } from '@/state/messages';

/** The booking's life so far, as the lobby header shows it (§7.2). */
/**
 * P-13 Match lobby — coordinate confirmed participants (§4.3).
 * TEAM-008: roster, open needs, venue, time, check-in state and conversation.
 * Cash check-in is confirmed by the venue owner — no in-app payment.
 */
export default function Lobby() {
  const router = useRouter();
  const { t } = useI18n();
  const { roster, cancelBooking, fillRosterSlot, activeBooking, checkedIn } = useBooking();
  const { ensureMatchThread } = useMessages();
  const filled = roster.filter((p) => p.filled).length;

  const threadId = activeBooking?.code?.toLowerCase() ?? 'xl-7k42';

  useEffect(() => {
    if (!activeBooking) return;
    ensureMatchThread({
      id: threadId,
      title: `${activeBooking.venue} · ${activeBooking.slot} PM`,
      preview: 'Match lobby open · cash at the gate',
    });
  }, [activeBooking, ensureMatchThread, threadId]);

  const stages = [
    { label: t('lobby.held'), done: true },
    { label: t('lobby.confirmed'), done: true },
    { label: t('lobby.cashCheckIn'), done: checkedIn || activeBooking?.status === 'checked_in' },
    { label: t('lobby.result'), done: false },
  ];

  const onCancel = () => {
    Alert.alert(t('lobby.cancelTitle'), BOOKING.cancellation, [
      { text: t('common.keep'), style: 'cancel' },
      {
        text: t('common.cancel'),
        style: 'destructive',
        onPress: () => {
          cancelBooking();
          router.replace('/');
        },
      },
    ]);
  };

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
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
        <View style={{ gap: 2 }}>
          <Txt size={19} weight="bold" em={-0.02} color={onVoid.primary}>
            Match lobby
          </Txt>
          <Txt size={11.5} color={onVoid.faint}>
            {BOOKING.code} · {activeBooking?.venue ?? BOOKING.venue} · {BOOKING.pitch}
          </Txt>
        </View>
      </View>

      <StageRail stages={stages} />

      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Eyebrow>Squad · 5-a-side</Eyebrow>
          <Txt size={11.5} color={onVoid.faint}>
            {filled} of 5 confirmed
          </Txt>
        </View>
        <View style={{ gap: 8 }}>
          {roster.map((entry) => (
            <RosterRow
              key={entry.name}
              entry={entry}
              onFill={() => fillRosterSlot('Invited player')}
            />
          ))}
        </View>
      </View>

      <View
        style={{
          padding: 16,
          borderRadius: radius.control,
          backgroundColor: void_.surface,
          borderWidth: 1,
          borderColor: onVoid.edge,
          gap: 10,
        }}
      >
        <Eyebrow>Lobby chat</Eyebrow>
        {LOBBY_CHAT.map((msg, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 9 }}>
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: radius.pill,
                backgroundColor: void_.inset,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Txt size={9} weight="bold" color={gold.base}>
                {msg.initials}
              </Txt>
            </View>
            <Txt size={12.5} lh={1.5} color="rgba(243,238,229,.7)" style={{ flex: 1 }}>
              {msg.line}
            </Txt>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          label={t('lobby.messageSquad')}
          variant="ghost"
          flex={1}
          size={13.5}
          style={{ borderColor: onVoid.line }}
          onPress={() => router.push(`/chat/${threadId}`)}
        />
        <Button label={t('lobby.cancelBooking')} variant="danger" flex={1} size={13.5} onPress={onCancel} />
      </View>
    </Screen>
  );
}

function StageRail({ stages }: { stages: { label: string; done: boolean }[] }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {stages.map((stage, i) => (
        <View key={stage.label} style={{ flexDirection: 'row', alignItems: 'center', flex: i === 0 ? 1 : 2 }}>
          {i > 0 ? (
            <View
              style={{
                height: 1,
                flex: 1,
                marginBottom: 16,
                backgroundColor: stage.done ? gold.base : 'rgba(243,238,229,.15)',
              }}
            />
          ) : null}
          <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View
              style={{
                width: 9,
                height: 9,
                borderRadius: radius.pill,
                ...(stage.done
                  ? { backgroundColor: gold.base }
                  : { borderWidth: 1, borderColor: 'rgba(243,238,229,.3)' }),
              }}
            />
            <Txt size={10} weight="semibold" color={stage.done ? gold.base : onVoid.dim}>
              {stage.label}
            </Txt>
          </View>
        </View>
      ))}
    </View>
  );
}

function RosterRow({ entry, onFill }: { entry: RosterEntry; onFill: () => void }) {
  const open = entry.tag === 'OPEN';
  const initials = entry.filled
    ? entry.name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '+';

  const content = (
    <>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: radius.pill,
          backgroundColor: entry.filled ? void_.inset : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Txt size={10.5} weight="bold" color={entry.filled ? gold.base : onVoid.dim}>
          {initials}
        </Txt>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt
          size={13.5}
          weight="semibold"
          color={entry.filled ? onVoid.primary : open ? gold.base : 'rgba(243,238,229,.55)'}
        >
          {entry.name}
        </Txt>
        <Txt size={11} color={onVoid.dim}>
          {entry.meta}
        </Txt>
      </View>
      <Txt
        size={10.5}
        weight="bold"
        em={0.08}
        color={entry.tag === 'YOU' ? onVoid.dim : open ? gold.base : onVoid.dim}
      >
        {entry.tag}
      </Txt>
    </>
  );

  const style = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: radius.row,
    backgroundColor: entry.filled ? void_.surface : 'transparent',
    borderWidth: 1,
    borderStyle: (entry.filled ? 'solid' : 'dashed') as 'solid' | 'dashed',
    borderColor: entry.filled ? onVoid.edgeFaint : open ? goldAlpha.accent : 'rgba(243,238,229,.14)',
  };

  if (entry.filled) return <View style={style}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.name}. ${entry.meta}`}
      onPress={onFill}
      style={({ pressed }) => [style, { opacity: pressed ? 0.75 : 1 }]}
    >
      {content}
    </Pressable>
  );
}
