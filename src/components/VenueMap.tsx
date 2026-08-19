import { Pressable, View } from 'react-native';
import { Txt } from './Txt';
import { gold, onVoid, radius, void_ } from '@/theme/tokens';
import { Venue } from '@/data/player';

/** Stylised map — venue pins on a Void grid (VEN-003 map view). */
const PINS: Record<string, { x: number; y: number }> = {
  'Stadium One': { x: 42, y: 38 },
  'The Box': { x: 68, y: 55 },
  'Nasr Sports Club': { x: 24, y: 62 },
};

export function VenueMap({ venues, onSelect }: { venues: Venue[]; onSelect: (venue: Venue) => void }) {
  return (
    <View
      style={{
        height: 220,
        borderRadius: radius.cardInner,
        backgroundColor: void_.surface,
        borderWidth: 1,
        borderColor: onVoid.edge,
        overflow: 'hidden',
      }}
    >
      <View style={{ position: 'absolute', inset: 0, opacity: 0.35 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View
            key={`h${i}`}
            style={{ position: 'absolute', left: 0, right: 0, top: i * 28, height: 1, backgroundColor: onVoid.hairline }}
          />
        ))}
        {Array.from({ length: 6 }).map((_, i) => (
          <View
            key={`v${i}`}
            style={{ position: 'absolute', top: 0, bottom: 0, left: i * 56, width: 1, backgroundColor: onVoid.hairline }}
          />
        ))}
      </View>
      {venues.map((venue) => {
        const pin = PINS[venue.name] ?? { x: 50, y: 50 };
        const soldOut = venue.open.length === 0;
        return (
          <Pressable
            key={venue.name}
            accessibilityRole="button"
            accessibilityLabel={`${venue.name}, ${venue.distanceKm} km`}
            onPress={() => onSelect(venue)}
            style={({ pressed }) => ({
              position: 'absolute',
              left: `${pin.x}%`,
              top: `${pin.y}%`,
              marginLeft: -8,
              marginTop: -8,
              alignItems: 'center',
              opacity: soldOut ? 0.4 : pressed ? 0.75 : 1,
            })}
          >
            <View
              style={{
                width: 14,
                height: 14,
                borderRadius: radius.pill,
                backgroundColor: venue.verified ? gold.base : onVoid.muted,
                borderWidth: 2,
                borderColor: void_.bg,
              }}
            />
            <Txt size={9.5} weight="semibold" color={onVoid.primary} style={{ marginTop: 4 }}>
              {venue.name.split(' ')[0]}
            </Txt>
          </Pressable>
        );
      })}
      <View style={{ position: 'absolute', bottom: 10, left: 12 }}>
        <Txt size={10} color={onVoid.dim}>
          Nasr City · pins are saleable venues tonight
        </Txt>
      </View>
    </View>
  );
}
