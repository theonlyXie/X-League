import { useState } from 'react';
import { Button } from './ui';
import { bookingWhatsapp, whatsappForPlayer } from '@/data/social';
import { openWhatsApp } from '@/lib/whatsapp';
import { useI18n } from '@/i18n';
import { isLive } from '@/lib/supabase';

/**
 * The button that replaced a room.
 *
 * Every conversation this product used to host now ends here: press it, and
 * WhatsApp opens on the person you were going to write to.
 *
 * The number is fetched on press rather than on render, for two reasons. A
 * roster of eleven would otherwise make eleven lookups to draw a screen nobody
 * has touched yet — and more importantly, the server decides case by case
 * whether the caller is entitled to a given number, so asking only when
 * somebody actually wants to reach that person keeps the app from holding a
 * list of phone numbers it was never shown for a reason.
 *
 * A refusal is a sentence from the server — "You can message players you have
 * shared a club, a team or a pitch with" — and goes to `onNotice` so the screen
 * can put it where its other refusals go.
 */
export function WhatsAppButton({
  playerId,
  bookingId,
  label,
  variant = 'ghost',
  height = 42,
  size,
  flex,
  onNotice,
}: {
  /** Reach a player. Exactly one of this and `bookingId`. */
  playerId?: string;
  /** Reach the other side of a booking: the venue, or its captain. */
  bookingId?: string;
  label: string;
  variant?: 'primary' | 'ghost' | 'decline';
  height?: number;
  size?: number;
  flex?: number;
  onNotice?: (sentence: string | null) => void;
}) {
  const { reason, t } = useI18n();
  const [busy, setBusy] = useState(false);

  async function open() {
    if (!isLive) {
      onNotice?.(t.offline);
      return;
    }
    setBusy(true);
    onNotice?.(null);
    try {
      const res = playerId
        ? await whatsappForPlayer(playerId)
        : bookingId
          ? await bookingWhatsapp(bookingId)
          : { ok: false as const, reason: undefined };

      if (!res.ok || !res.reachable) {
        onNotice?.(reason(res.reason) ?? t.offline);
        return;
      }
      // The only failure left is a phone with nothing that can open a URL,
      // which is not a thing to leave silent on a button somebody just pressed.
      if (!(await openWhatsApp(res.reachable.waNumber))) onNotice?.(t.couldNotOpenWhatsApp);
    } catch {
      onNotice?.(t.offline);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      label={label}
      variant={variant}
      height={height}
      size={size}
      flex={flex}
      disabled={busy}
      onPress={() => void open()}
    />
  );
}
