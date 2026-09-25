import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { TextInput } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { OpButton, OpNotice } from '@/components/operative';
import { OpCard, OpEmpty, OpGroup, OpMenuGroup, OpMenuRow, OpPage, OpPill, OpPills } from '@/components/kitOperative';
import { Search, User } from '@/components/icons';
import { ink, onOperative, operative, radius } from '@/theme/tokens';
import { face } from '@/theme/typography';
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
  const { reason, t } = useI18n();
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

  // The role as a word in the reader's language. The enum value was drawn
  // as-is, so an Arabic manager read `staff`, `manager` and `owner` in English
  // on every row, and a suspended one read " · suspended".
  const roleLabel = (r: VenueRole) =>
    r === 'owner' ? t.ownerRoleOwner : r === 'manager' ? t.ownerRoleManager : t.ownerRoleStaff;

  const grantable = ROLES.filter((r) => ROLES.indexOf(r) <= ROLES.indexOf(myRole));
  const onList = new Set(rows.map((r) => r.userId));

  const set = async (userId: string, role: VenueRole, active: boolean) => {
    if (!venue) return;
    const res = await setVenueStaff(venue.venueId, userId, role, active);
    if (!res.ok) setNotice(reason(res.reason) ?? null);
    else setNotice(null);
    void load();
  };

  return (
    <OpPage title={t.ownStaff} subtitle={venue?.name}>
      <OpNotice text={notice} />
      {loading ? <ActivityIndicator color={ink} /> : null}

      <OpGroup title={t.ownWorkingHere}>
        {rows.map((m) => (
          <OpCard key={m.userId} pad={14} style={m.active ? undefined : { opacity: 0.55 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Initials name={m.displayName} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt size={14.5} weight="semibold" color={ink} numberOfLines={1}>
                  {m.displayName}
                </Txt>
                <Txt size={11.5} color={onOperative.faint}>
                  {m.active ? roleLabel(m.role) : `${roleLabel(m.role)} · ${t.ownerStaffSuspended}`}
                </Txt>
              </View>
              <OpButton
                label={m.active ? t.ownSuspend : t.ownRestore}
                tone={m.active ? 'danger' : 'quiet'}
                onPress={() => set(m.userId, m.role, !m.active)}
              />
            </View>
            <OpPills>
              {grantable.map((r) => (
                <OpPill
                  key={r}
                  size="sm"
                  role="button"
                  on={m.role === r}
                  label={roleLabel(r)}
                  accessibilityLabel={t.setRoleFor(m.displayName, roleLabel(r))}
                  onPress={() => set(m.userId, r, true)}
                />
              ))}
            </OpPills>
          </OpCard>
        ))}
        {rows.length === 0 && !loading && !notice ? <OpEmpty title={t.ownNobodyElseWorksHere} /> : null}
      </OpGroup>

      <OpGroup title={t.ownAddSomebody} hint={t.ownStaffHint}>
        <View
          style={{
            height: 48,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 14,
            borderRadius: radius.row,
            borderWidth: 1,
            borderColor: onOperative.line,
            backgroundColor: operative.surface,
          }}
        >
          <Search size={18} color={query ? ink : onOperative.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t.ownSearchByName}
            placeholderTextColor={onOperative.disabled}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={t.ownSearchByName}
            style={{ flex: 1, height: '100%', color: ink, fontFamily: face.regular, fontSize: 15 }}
          />
        </View>
        {results.filter((p) => !onList.has(p.playerId)).length > 0 ? (
          <OpMenuGroup>
            {results
              .filter((p) => !onList.has(p.playerId))
              .map((p) => (
                <OpMenuRow
                  key={p.playerId}
                  icon={<User size={19} color={ink} />}
                  title={p.displayName}
                  right={<OpButton label={t.ownAddStaff} onPress={() => set(p.playerId, 'staff', true)} />}
                />
              ))}
          </OpMenuGroup>
        ) : null}
      </OpGroup>
    </OpPage>
  );
}

/** Two letters in a disc, where a staff member has no photo to show. */
function Initials({ name }: { name: string }) {
  return (
    <View
      style={{
        width: 38,
        height: 38,
        borderRadius: radius.pill,
        backgroundColor: operative.band,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt size={13} weight="bold" color={ink}>
        {name.slice(0, 2).toUpperCase()}
      </Txt>
    </View>
  );
}
