import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { OpButton, OpHeader, OpNotice, OpRow, OpScreen, OpSection } from '@/components/operative';
import { ink, onOperative, radius } from '@/theme/tokens';
import { setVenueStaff, venueStaffList, type StaffMember, type VenueRole } from '@/data/manage';
import { findPlayers, type FoundPlayer } from '@/data/squad';
import { useSession } from '@/state/session';
import { isLive } from '@/lib/supabase';
import { useI18n } from '@/i18n';

const ROLES: VenueRole[] = ['staff', 'manager', 'owner'];

/**
 * O-05 — who can work the gate.
 *
 * Authority only ever moves sideways or down: a manager cannot grant a role
 * above their own, and cannot change their own at all. Both are enforced on the
 * server; the controls here simply do not offer what would be refused, which is
 * a courtesy rather than the boundary.
 *
 * Suspending is not deleting. OWN-014 wants the audit history intact, so a
 * former staff member stays on the list, inactive.
 */
export default function Staff() {
  const { t } = useI18n();
  const router = useRouter();
  const { activeVenue } = useSession();
  const venue = activeVenue;
  const myRole = venue?.role ?? 'staff';

  const [rows, setRows] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(isLive);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoundPlayer[]>([]);

  const load = useCallback(async () => {
    if (!isLive || !venue) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await venueStaffList(venue.venueId));
      setNotice(null);
    } catch {
      setNotice(t.ownStaffManagerOnly);
    } finally {
      setLoading(false);
    }
  }, [venue?.venueId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isLive || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      findPlayers(query.trim())
        .then((r) => !cancelled && setResults(r))
        .catch(() => !cancelled && setResults([]));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const grantable = ROLES.filter((r) => ROLES.indexOf(r) <= ROLES.indexOf(myRole));
  const onList = new Set(rows.map((r) => r.userId));

  const set = async (userId: string, role: VenueRole, active: boolean) => {
    if (!venue) return;
    const res = await setVenueStaff(venue.venueId, userId, role, active);
    if (!res.ok) setNotice(res.reason ?? null);
    else setNotice(null);
    void load();
  };

  return (
    <OpScreen>
      <OpHeader title={t.ownStaff} onBack={() => router.back()} />
      <OpNotice text={notice} />
      {loading ? <ActivityIndicator color={ink} /> : null}

      <OpSection title={t.ownWorkingHere}>
        <View style={{ gap: 8 }}>
          {rows.map((m) => (
            <OpRow key={m.userId} style={m.active ? undefined : { opacity: 0.55 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Txt size={13} weight="semibold" color={ink}>
                  {m.displayName}
                </Txt>
                <Txt size={10.5} color="rgba(20,18,16,.45)">
                  {m.role}
                  {m.active ? '' : ' · suspended'}
                </Txt>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {grantable.map((r) => (
                  <Pressable
                    key={r}
                    accessibilityRole="button"
                    accessibilityLabel={`Set ${m.displayName} to ${r}`}
                    onPress={() => set(m.userId, r, true)}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: radius.chip,
                      borderWidth: 1,
                      borderColor: m.role === r ? ink : onOperative.hairline,
                    }}
                  >
                    <Txt size={10.5} weight={m.role === r ? 'semibold' : 'regular'} color={ink}>
                      {r}
                    </Txt>
                  </Pressable>
                ))}
                <OpButton
                  label={m.active ? t.ownSuspend : t.ownRestore}
                  tone={m.active ? 'danger' : 'quiet'}
                  onPress={() => set(m.userId, m.role, !m.active)}
                />
              </View>
            </OpRow>
          ))}
          {rows.length === 0 && !loading && !notice ? (
            <Txt size={12.5} color={onOperative.dim}>
              Nobody else works here yet.
            </Txt>
          ) : null}
        </View>
      </OpSection>

      <OpSection title={t.ownAddSomebody} hint="They need an X League account first — this grants a role, it does not create a person.">
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t.ownSearchByName}
          placeholderTextColor="rgba(20,18,16,.32)"
          autoCapitalize="none"
          style={{
            height: 40,
            paddingHorizontal: 12,
            borderRadius: radius.chip,
            borderWidth: 1,
            borderColor: onOperative.hairline,
            backgroundColor: '#FFFDF9',
            color: ink,
            fontSize: 13,
          }}
        />
        <View style={{ gap: 8 }}>
          {results
            .filter((p) => !onList.has(p.playerId))
            .map((p) => (
              <OpRow key={p.playerId}>
                <Txt size={13} weight="semibold" color={ink} style={{ flex: 1 }}>
                  {p.displayName}
                </Txt>
                <OpButton label={t.ownAddStaff} onPress={() => set(p.playerId, 'staff', true)} />
              </OpRow>
            ))}
        </View>
      </OpSection>
    </OpScreen>
  );
}
