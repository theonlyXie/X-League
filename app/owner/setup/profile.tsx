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

/**
 * O-07 — what players see.
 *
 * Verification is shown but not editable. A venue cannot mark itself verified,
 * which is the entire value of the badge; the platform sets it and this screen
 * reports the answer.
 */
export default function VenueProfile() {
  const router = useRouter();
  const { venues } = useSession();
  const venue = venues[0] ?? null;

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
      setNotice(null);
    } catch {
      setNotice('Could not read this venue.');
    } finally {
      setLoading(false);
    }
  }, [venue?.venueId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <OpScreen>
      <OpHeader title="Venue profile" onBack={() => router.back()} />
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
              ? 'Verified by X League'
              : `Verification: ${detail.verification}. Set by the platform, not here.`}
          </Txt>
        </View>
      ) : null}

      <OpSection title="Details">
        <OpField label="Name" value={name} onChangeText={setName} />
        <OpField label="Area" value={area} onChangeText={setArea} />
        <OpField label="Phone" value={phone} onChangeText={setPhone} />
      </OpSection>

      <OpSection title="At the gate" hint="What the confirmation screen tells a player when they arrive.">
        <OpField label="Entry note" value={entryNote} onChangeText={setEntryNote} placeholder="Gate 2 · ask for Pitch A" />
      </OpSection>

      <OpSection title="House rules">
        <OpField label="Rules" value={houseRules} onChangeText={setHouseRules} />
      </OpSection>

      <OpSection title="Facilities" hint="Comma separated. These become the chips on the pitch page.">
        <OpField label="Amenities" value={amenities} onChangeText={setAmenities} placeholder="Floodlights, Parking" />
      </OpSection>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <OpButton
          label="Save"
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
