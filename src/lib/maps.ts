import { Linking, Platform } from 'react-native';

/** VEN-009: deep-link to an installed maps app. */
export function openVenueNavigation(name: string, lat: number, lng: number) {
  const label = encodeURIComponent(name);
  const url =
    Platform.select({
      ios: `maps:0,0?q=${label}@${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    }) ?? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  Linking.openURL(url).catch(() => {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
  });
}
