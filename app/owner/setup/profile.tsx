import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { OpField, OpNotice, OpStanding } from '@/components/operative';
import { OpActionButton, OpCard, OpGroup, OpPage } from '@/components/kitOperative';
import { CheckCircle } from '@/components/icons';
import { gold, ink, onOperative, radius } from '@/theme/tokens';
import { updateVenueProfile } from '@/data/manage';
import { venueDetail, type VenueDetail } from '@/data/discovery';
import { useSession, type VenueVerification } from '@/state/session';
import { isLive } from '@/lib/supabase';
import { useI18n } from '@/i18n';
import { useVenueStanding } from '@/state/standing';

/**
 * O-07 — what players see.
 *
 * Verification is shown but not editable. A venue cannot mark itself verified,
 * which is the entire value of the badge; the platform sets it and this screen
 * reports the answer.
 */
export default function VenueProfile() {
  const { reason, t } = useI18n();
  const { activeVenue } = useSession();
  const venue = activeVenue;

  const [detail, setDetail] = useState<VenueDetail | null>(null);
  // From the freshly-read venue rather than the session's copy, since this is
  // the screen that just asked the server.
  const standing = useVenueStanding(detail?.verification as VenueVerification | undefined);
  const [loading, setLoading] = useState(isLive);
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [phone, setPhone] = useState('');
  const [entryNote, setEntryNote] = useState('');
  const [houseRules, setHouseRules] = useState('');
  const [amenities, setAmenities] = useState('');
  const [mapUrl, setMapUrl] = useState('');

  const load = useCallback(async () => {
    if (!isLive || !venue) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const d = await venueDetail(venue.venueId);
      setDetail(d);
      setName(d?.name ?? '');
      setArea(d?.area ?? '');
      setPhone(d?.phone ?? '');
      setEntryNote(d?.entryNote ?? '');
      setHouseRules(d?.houseRules ?? '');
      setAmenities((d?.amenities ?? []).join(', '));
      setMapUrl(d?.mapUrl ?? '');
      setNotice(null);
    } catch {
      setNotice(t.ownVenueUnreadable);
    } finally {
      setLoading(false);
    }
  }, [venue?.venueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!venue) return;
    const res = await updateVenueProfile(venue.venueId, {
      name,
      area,
      phone,
      entryNote,
      houseRules,
      amenities: amenities
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      mapUrl: mapUrl.trim(),
    });
    if (res.ok) {
      setSaved(true);
      setNotice(null);
      void load();
    } else {
      setSaved(false);
      setNotice(reason(res.reason) ?? null);
    }
  };

  return (
    <OpPage
      title={t.ownProfile}
      subtitle={venue?.name}
      // Pinned, because the form is longer than a phone and Save used to sit
      // under the last field, out of sight while every other field was edited.
      footer={
        <>
          {saved ? (
            <Txt size={12} weight="semibold" color={onOperative.muted} style={{ flexShrink: 1 }}>
              {t.ownHoursSaved}
            </Txt>
          ) : null}
          <OpActionButton label={t.ownSave} onPress={() => void save()} flex />
        </>
      }
    >
      <OpNotice text={notice} />
      {loading ? <ActivityIndicator color={ink} /> : null}

      {/* Verified keeps its gold badge. Anything else now says what it means in
          words, from the same place Owner Today reads — this printed
          `Verification: pending. Set by the platform, not here.`, which is a
          column value and a line of developer-speak, in English on a screen
          that is otherwise fully translated. */}
      {detail && detail.verification === 'verified' ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: radius.row,
            borderWidth: 1,
            borderColor: 'rgba(198,163,75,.5)',
            backgroundColor: 'rgba(198,163,75,.08)',
          }}
        >
          <CheckCircle size={18} color={gold.ink} />
          <Txt size={12.5} weight="semibold" color={gold.ink} style={{ flex: 1 }}>
            {t.ownVerifiedByX}
          </Txt>
        </View>
      ) : null}

      {detail && standing ? (
        <OpStanding
          title={standing.title}
          blurb={`${standing.blurb} ${t.ownVerificationSetByPlatform}`}
          tone={standing.tone}
        />
      ) : null}

      <OpGroup title={t.ownDetails}>
        <OpCard>
          <OpField label={t.ownName} value={name} onChangeText={setName} />
          <OpField label={t.ownArea} value={area} onChangeText={setArea} />
          <OpField label={t.ownPhone} value={phone} onChangeText={setPhone} />
        </OpCard>
      </OpGroup>

      <OpGroup title={t.ownAtGateSection} hint={t.ownEntryNoteHint}>
        <OpCard>
          <OpField label={t.ownEntryNote} value={entryNote} onChangeText={setEntryNote} placeholder={t.ownEgEntryNote} />
        </OpCard>
      </OpGroup>

      <OpGroup title={t.ownHouseRules}>
        <OpCard>
          <OpField label={t.ownRules} value={houseRules} onChangeText={setHouseRules} multiline />
        </OpCard>
      </OpGroup>

      {/* VEN-009: the deep link a player's "Navigate" button opens. Nothing
          could set it, so that button did nothing for every venue. */}
      <OpGroup title={t.ownFindUs} hint={t.ownMapHint}>
        <OpCard>
          <OpField
            label={t.ownMapLink}
            value={mapUrl}
            onChangeText={setMapUrl}
            placeholder={t.ownEgMapLink}
            autoCapitalize="none"
          />
        </OpCard>
      </OpGroup>

      <OpGroup title={t.ownFacilities} hint={t.ownAmenitiesHint}>
        <OpCard>
          <OpField label={t.ownAmenities} value={amenities} onChangeText={setAmenities} placeholder={t.ownEgAmenities} />
        </OpCard>
      </OpGroup>
    </OpPage>
  );
}
