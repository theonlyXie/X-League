import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Txt } from './Txt';
import { hitSlopTo44 } from './ui';
import { gold, onVoid, radius, void_ } from '@/theme/tokens';
import { SlotTime } from '@/data/player';
import { useI18n } from '@/i18n';

/**
 * The hour grid on the pitch page — option 1f, the "chips" model: thumb-safe
 * and readable at a glance.
 *
 * Column width is measured rather than guessed so four columns stay four
 * columns at any device width.
 */
export function SlotGrid({
  times,
  taken,
  selected,
  onSelect,
  columns = 4,
  gap = 8,
}: {
  times: SlotTime[];
  taken: SlotTime[];
  selected: SlotTime;
  onSelect: (t: SlotTime) => void;
  columns?: number;
  gap?: number;
}) {
  const { t: strings, hourLabel } = useI18n();
  const [width, setWidth] = useState(0);
  const cell = width > 0 ? (width - gap * (columns - 1)) / columns : 0;

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}
    >
      {times.map((t) => {
        const isTaken = taken.includes(t);
        const on = t === selected;
        // The chip is a rendering of the hour, not the hour itself. It used to
        // draw the identity directly and append "PM" — so a venue open from 10
        // in the morning drew two chips reading `10:00`, one of them the wrong
        // hour, and told a screen-reader user both were in the evening.
        const label = hourLabel(Number(t));
        return (
          <Pressable
            key={t}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: isTaken }}
            accessibilityLabel={isTaken ? strings.slotTaken(label) : label}
            disabled={isTaken}
            onPress={() => onSelect(t)}
            hitSlop={hitSlopTo44(40)}
            style={{
              width: cell || undefined,
              height: 40,
              borderRadius: radius.chip,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              backgroundColor: on ? gold.base : void_.surface,
              borderColor: on ? gold.base : isTaken ? 'rgba(243,238,229,.06)' : onVoid.hairline,
              opacity: cell ? 1 : 0,
            }}
          >
            <Txt
              size={12.5}
              weight={on ? 'bold' : 'medium'}
              color={on ? void_.bg : isTaken ? onVoid.disabled : 'rgba(243,238,229,.72)'}
              style={isTaken ? { textDecorationLine: 'line-through' } : undefined}
            >
              {label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
