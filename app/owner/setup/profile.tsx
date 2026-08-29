import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Txt } from '@/components/Txt';
import {
  OpButton,
  OpField,
  OpHeader,
  OpNotice,
  OpScreen,
  OpSection,
} from '@/components/operative';
import { gold, ink, onOperative, radius } from '@/theme/tokens';
import { updateVenueProfile } from '@/data/manage';
import { venueDetail, type VenueDetail } from '@/data/discovery';
import { useSession } from '@/state/session';
import { isLive } from '@/lib/supabase';
import { useI18n } from '@/i18n';

/**
 * O-07 — what players see.
 *
 * Verification is shown but not editable. A venue cannot mark itself verified,
 * which is the entire value of the badge; the platform sets it and this screen
 * reports the answer.
 */
export default function VenueProfile() {
  const { t } = useI18n();
  const router = useRouter();
  const { activeVenue } = useSession();
  const venue = activeVenue;

  const [detail, setDetail] = useState<VenueDetail | null>(null);
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

  return (
    <OpScreen>
      <OpHeader title={t.ownProfile} onBack={() => router.back()} />
      <OpNotice text={notice} />
      {loading ? <ActivityIndicator color={ink} /> : null}

      {detail ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: radius.chip,
            borderWidth: 1,
            borderColor: detail.verification === 'verified' ? 'rgba(198,163,75,.5)' : onOperative.hairline,
          }}
        >
          <Txt size={11.5} color={detail.verification === 'verified' ? gold.ink : onOperative.dim}>
            {detail.verification === 'verified'
              ? t.ownVerifiedByX
              : `Verification: ${detail.verification}. Set by the platform, not here.`}
          </Txt>
        </View>
      ) : null}

      <OpSection title={t.ownDetails}>
        <OpField label={t.ownName} value={name} onChangeText={setName} />
        <OpField label={t.ownArea} value={area} onChangeText={setArea} />
        <OpField label={t.ownPhone} value={phone} onChangeText={setPhone} />
      </OpSection>

      <OpSection title={t.ownAtGateSection} hint={t.ownEntryNoteHint}>
        <OpField label={t.ownEntryNote} value={entryNote} onChangeText={setEntryNote} placeholder={t.ownEgEntryNote} />
      </OpSection>

      <OpSection title={t.ownHouseRules}>
        <OpField label={t.ownRules} value={houseRules} onChangeText={setHouseRules} />
      </OpSection>

      {/* VEN-009: the deep link a player's "Navigate" button opens. Nothing
          could set it, so that button did nothing for every venue. */}
      <OpSection title={t.ownFindUs} hint={t.ownMapHint}>
        <OpField label={t.ownMapLink} value={mapUrl} onChangeText={setMapUrl} placeholder={t.ownEgMapLink} />
      </OpSection>

      <OpSection title={t.ownFacilities} hint={t.ownAmenitiesHint}>
        <OpField label={t.ownAmenities} value={amenities} onChangeText={setAmenities} placeholder={t.ownEgAmenities} />
      </OpSection>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <OpButton
          label={t.ownSave}
          onPress={async () => {
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
              setNotice(res.reason ?? null);
            }
          }}
        />
        {saved ? (
          <Txt size={11.5} color={onOperative.dim}>
            Saved.
          </Txt>
        ) : null}
      </View>
    </OpScreen>
  );
}
