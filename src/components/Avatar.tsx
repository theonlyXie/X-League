import { Image, View } from 'react-native';
import { Txt } from '@/components/Txt';

/**
 * A face, or the initials that stand in for one.
 *
 * Null is a real answer: most people will not have uploaded anything, and a
 * grey silhouette says "broken" where initials say "not yet". The initials are
 * derived here so every surface that shows a person derives them the same way.
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  url,
  size = 40,
  radius,
  background,
  border,
  color,
}: {
  name: string;
  url?: string | null;
  size?: number;
  radius?: number;
  background: string;
  border: string;
  color: string;
}) {
  const round = radius ?? size / 2;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: round,
        backgroundColor: background,
        borderWidth: 1,
        borderColor: border,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {url ? (
        <Image
          source={{ uri: url }}
          accessibilityIgnoresInvertColors
          style={{ width: size, height: size }}
          resizeMode="cover"
        />
      ) : (
        <Txt weight="semibold" size={Math.max(11, Math.round(size * 0.34))} color={color}>
          {initialsOf(name)}
        </Txt>
      )}
    </View>
  );
}
