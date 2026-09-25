import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { TextInput } from '@/components/TextField';
import { Txt } from './Txt';
import { Button, Eyebrow } from './ui';
import { burgundy, onVoid, radius, void_ } from '@/theme/tokens';
import { submitReport, type ReportReason } from '@/data/social';
import { useI18n } from '@/i18n';

/**
 * The moderation intake.
 *
 * `submit_report` has been in the schema, granted and tested since the
 * messaging migration, and had no caller anywhere. Both consoles render a full
 * moderation queue off `admin_reports` — a queue that, with no way to file a
 * report, could only ever say "Nothing reported." The whole of MSG-005 and the
 * safety story behind it existed on one side of the wire.
 *
 * Deliberately says where a report goes. A player who thinks they are
 * complaining to the venue, and a player who knows they are escalating past
 * it, are reporting different things.
 */
export function ReportSheet({
  kind,
  subjectId,
  subjectName,
  open,
  onClose,
}: {
  kind: 'player' | 'venue' | 'booking';
  subjectId: string;
  subjectName?: string;
  open: boolean;
  onClose: () => void;
}) {
  const { reason: say, t } = useI18n();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const REASONS: { key: ReportReason; label: string }[] = [
    { key: 'abuse', label: t.reportAbuse },
    { key: 'no_show', label: t.reportNoShow },
    { key: 'unsafe', label: t.reportUnsafe },
    { key: 'spam', label: t.reportSpam },
    { key: 'wrong_info', label: t.reportWrongInfo },
    { key: 'other', label: t.reportOther },
  ];

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    setNotice(null);
    const res = await submitReport(kind, subjectId, reason, body.trim() || undefined).catch(() => ({
      ok: false,
      reason: t.offline,
    }));
    setBusy(false);
    if (res.ok) {
      setSent(true);
      setNotice(t.reportSent);
    } else {
      setNotice(say(res.reason) ?? t.reportFailed);
    }
  };

  const close = () => {
    setReason(null);
    setBody('');
    setNotice(null);
    setSent(false);
    onClose();
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(8,8,8,.6)' }} onPress={close} />
      <View
        style={{
          backgroundColor: void_.surface,
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
          borderTopWidth: 1,
          borderColor: onVoid.edge,
          padding: 20,
          paddingBottom: 34,
          gap: 16,
        }}
      >
        <View style={{ gap: 5 }}>
          <Txt size={18} weight="bold" em={-0.02} color={onVoid.primary}>
            {t.reportTitle}
          </Txt>
          <Txt size={12.5} lh={1.5} color={onVoid.muted}>
            {subjectName ? `${subjectName} · ${t.reportBlurb}` : t.reportBlurb}
          </Txt>
        </View>

        {sent ? null : (
          <>
            <View style={{ gap: 8 }}>
              <Eyebrow>{t.reportReason}</Eyebrow>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {REASONS.map((r) => {
                  const on = r.key === reason;
                  return (
                    <Pressable
                      key={r.key}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={r.label}
                      onPress={() => setReason(r.key)}
                      style={{
                        paddingVertical: 9,
                        paddingHorizontal: 14,
                        borderRadius: radius.chip,
                        borderWidth: 1,
                        borderColor: on ? onVoid.primary : onVoid.line,
                        backgroundColor: on ? 'rgba(243,238,229,.1)' : 'transparent',
                      }}
                    >
                      <Txt size={12.5} weight={on ? 'semibold' : 'regular'} color={onVoid.primary}>
                        {r.label}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Eyebrow>{t.reportDetail}</Eyebrow>
              <TextInput
                value={body}
                onChangeText={setBody}
                multiline
                accessibilityLabel={t.reportDetail}
                placeholderTextColor={onVoid.disabled}
                style={{
                  minHeight: 78,
                  borderRadius: radius.chip,
                  borderWidth: 1,
                  borderColor: onVoid.line,
                  padding: 12,
                  color: onVoid.primary,
                  fontSize: 13.5,
                  textAlignVertical: 'top',
                }}
              />
            </View>
          </>
        )}

        {notice ? (
          <Txt size={12.5} weight="semibold" color={sent ? onVoid.primary : burgundy.action}>
            {notice}
          </Txt>
        ) : null}

        {sent ? (
          <Button label={t.close} variant="ghost" onPress={close} />
        ) : (
          <Button
            label={busy ? t.reportSending : t.reportSend}
            disabled={!reason || busy}
            onPress={send}
          />
        )}
      </View>
    </Modal>
  );
}
