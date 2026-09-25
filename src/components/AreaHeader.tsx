import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from './Txt';
import { ChevronDown, Close, Pin } from './icons';
import { NotificationBell } from './NotificationBell';
import { Radio } from './kit';
import { gold, onVoid, radius, void_ } from '@/theme/tokens';
import { GOVERNORATES } from '@/data/egypt';
import { useArea } from '@/state/area';
import { useI18n } from '@/i18n';

/**
 * The top of Home: where the feed is for, and the bell.
 *
 * The redesign's location line, answered with a governorate rather than a GPS
 * fix — see `state/area` for why. Tapping it is the redesign's "What's your
 * location?" screen, as a sheet, because it is a question somebody answers
 * once and then occasionally, not a step everybody has to pass through.
 */
export function AreaHeader() {
  const { t } = useI18n();
  const { area, setArea } = useArea();
  const [open, setOpen] = useState(false);
  const chosen = GOVERNORATES.find((g) => g.code === area);
  const label = chosen ? t[chosen.label] : t.allOfEgypt;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t.whereAreYouPlaying} ${label}`}
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 }}
      >
        <Pin size={20} color={gold.base} />
        <Txt size={18} weight="bold" em={-0.01} color={onVoid.primary} numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
        </Txt>
        <ChevronDown size={18} color={onVoid.muted} />
      </Pressable>
      <NotificationBell />

      <AreaSheet
        open={open}
        value={area}
        onClose={() => setOpen(false)}
        onPick={(code) => {
          setArea(code);
          setOpen(false);
        }}
      />
    </View>
  );
}

function AreaSheet({
  open,
  value,
  onClose,
  onPick,
}: {
  open: boolean;
  value: string | null;
  onClose: () => void;
  onPick: (code: string | null) => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const rows: { code: string | null; label: string }[] = [
    { code: null, label: t.allOfEgypt },
    ...GOVERNORATES.map((g) => ({ code: g.code, label: t[g.label] })),
  ];

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.close}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.6)' }}
      />
      <View
        style={{
          maxHeight: '78%',
          backgroundColor: void_.surface,
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
          borderTopWidth: 1,
          borderColor: onVoid.edge,
          paddingBottom: insets.bottom + 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 20, paddingBottom: 12 }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Txt size={22} weight="bold" em={-0.02} color={onVoid.primary}>
              {t.whereAreYouPlaying}
            </Txt>
            <Txt size={13} lh={1.5} color={onVoid.muted}>
              {t.areaBlurb}
            </Txt>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t.close} hitSlop={10} onPress={onClose}>
            <Close size={20} color={onVoid.muted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 8 }}>
          {rows.map((r) => {
            const on = r.code === value;
            return (
              <Pressable
                key={r.code ?? 'all'}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={r.label}
                onPress={() => onPick(r.code)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 13,
                  paddingHorizontal: 12,
                  borderRadius: radius.row,
                  backgroundColor: pressed ? 'rgba(198,163,75,.07)' : 'transparent',
                })}
              >
                <Radio on={on} />
                <Txt size={15} weight={on ? 'bold' : 'regular'} color={on ? gold.base : onVoid.secondary}>
                  {r.label}
                </Txt>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}
