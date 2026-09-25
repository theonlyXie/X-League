import { Linking } from 'react-native';

/**
 * Opening a conversation somewhere else.
 *
 * X League used to carry its own messaging. It does not any more: a channel
 * needs moderation behind it every hour of every day, and the product's job is
 * to get a match booked and played. So where there was a room there is now a
 * button, and the conversation happens on WhatsApp — which everybody playing
 * football in Egypt already has open, and which has spent a decade building the
 * blocking and reporting this would otherwise have had to build badly.
 *
 * The number never comes from the client. `whatsapp_for_player` on the server
 * decides whether the caller is entitled to it — a club-mate, a team-mate, or
 * somebody in the same match — and returns digits already in the shape
 * `wa.me` wants. Nothing here reformats them, because a number that has been
 * through `normalise_phone` is the same one sign-in resolves and "fixing" it
 * would only break that.
 */

/** `https://wa.me/201012345678`, from digits the server produced. */
export function waLink(waNumber: string): string {
  return `https://wa.me/${waNumber.replace(/\D/g, '')}`;
}

/**
 * Hand the number to WhatsApp, or fall back to the dialler.
 *
 * `wa.me` is a web URL, so it opens in a browser on a phone with no WhatsApp
 * installed and offers the install — which is the right ending, and the reason
 * this does not try the `whatsapp://` scheme first. `tel:` is the fallback for
 * when even that cannot be opened, because a number somebody has been given is
 * still a number they can ring.
 */
export async function openWhatsApp(waNumber: string): Promise<boolean> {
  const digits = waNumber.replace(/\D/g, '');
  if (!digits) return false;
  try {
    await Linking.openURL(waLink(digits));
    return true;
  } catch {
    try {
      await Linking.openURL(`tel:+${digits}`);
      return true;
    } catch {
      return false;
    }
  }
}
