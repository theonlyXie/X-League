import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from '@/components/Txt';
import { VoidMark } from '@/components/VoidMark';
import { OpButton, OpNotice } from '@/components/operative';
import {
  burgundy,
  console_,
  gold,
  ink,
  onOperative,
  operative,
  radius,
  status,
  void_,
} from '@/theme/tokens';
import { mono } from '@/theme/typography';
import {
  adminAudit,
  adminFindUsers,
  adminLedger,
  adminOverview,
  adminReports,
  adminResolveReport,
  adminSetSetting,
  adminSetVerification,
  adminSettings,
  adminSuspendUser,
  adminVerificationQueue,
  myPlatformRole,
  type AdminOverview,
  type AdminReport,
  type AdminUser,
  type AuditEntry,
  type LedgerRow,
  type PendingVenue,
  type PlatformRole,
  type Setting,
} from '@/data/manage';
import { useSession } from '@/state/session';
import { isLive } from '@/lib/supabase';

/**
 * A-01 – A-08 — the admin console (§4.6).
 *
 * A protected responsive web surface, so it keeps its own fixed canvas rather
 * than collapsing to a phone layout: an operator reading the ledger needs the
 * columns side by side. On a narrow screen it pans.
 *
 * Every section calls a function that checks platform authority for itself
 * (RBAC-003). The rail is drawn from `my_platform_role` only so the console can
 * avoid offering a door that will not open — it never decides who may enter.
 */

type Section = 'Overview' | 'Venues' | 'Users' | 'Moderation' | 'Ledger' | 'Settings' | 'Audit';

const NAV: { label: Section; min: PlatformRole }[] = [
  { label: 'Overview', min: 'support' },
  { label: 'Venues', min: 'moderator' },
  { label: 'Users', min: 'support' },
  { label: 'Moderation', min: 'moderator' },
  { label: 'Ledger', min: 'admin' },
  { label: 'Settings', min: 'admin' },
  { label: 'Audit', min: 'admin' },
];

const RANK: Record<PlatformRole, number> = { support: 0, moderator: 1, admin: 2 };

export default function AdminConsole() {
  const insets = useSafeAreaInsets();
  const { signedIn } = useSession();
  const [role, setRole] = useState<PlatformRole | null>(null);
  const [checking, setChecking] = useState(isLive);
  const [section, setSection] = useState<Section>('Overview');

  useEffect(() => {
    if (!isLive) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = signedIn ? await myPlatformRole() : null;
        if (!cancelled) setRole(r);
      } catch {
        if (!cancelled) setRole(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const visible = NAV.filter((n) => !isLive || (role && RANK[role] >= RANK[n.min]));

  return (
    <View style={{ flex: 1, backgroundColor: operative.bg, paddingTop: insets.top }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ width: console_.width, flex: 1, flexDirection: 'row' }}>
          <Rail sections={visible.map((v) => v.label)} active={section} onSelect={setSection} role={role} />
          <View style={{ flex: 1 }}>
            <TopBar section={section} />
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingVertical: 20, paddingHorizontal: 22, gap: 18 }}
              showsVerticalScrollIndicator={false}
            >
              {checking ? <ActivityIndicator color={ink} /> : null}

              {isLive && !checking && !role ? (
                <OpNotice text="This account does not have a console role. Ask an administrator for access." />
              ) : null}

              {(!isLive || role) && !checking ? (
                <>
                  {section === 'Overview' ? <Overview /> : null}
                  {section === 'Venues' ? <Venues /> : null}
                  {section === 'Users' ? <Users /> : null}
                  {section === 'Moderation' ? <Moderation /> : null}
                  {section === 'Ledger' ? <Ledger /> : null}
                  {section === 'Settings' ? <Settings /> : null}
                  {section === 'Audit' ? <Audit /> : null}
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

function Rail({
  sections,
  active,
  onSelect,
  role,
}: {
  sections: Section[];
  active: Section;
  onSelect: (s: Section) => void;
  role: PlatformRole | null;
}) {
  const router = useRouter();

  return (
    <View
      style={{
        width: console_.rail,
        backgroundColor: void_.bg,
        paddingVertical: 18,
        paddingHorizontal: 12,
        gap: 22,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="X League admin. Leave the console"
        onPress={() => router.replace('/')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8 }}
      >
        <VoidMark size={22} rings={1} />
        <View style={{ gap: 1 }}>
          <Txt size={12.5} weight="bold" em={0.02} color={operative.bg}>
            X LEAGUE
          </Txt>
          <Txt size={9} weight="semibold" em={0.18} color={gold.base}>
            {(role ?? 'admin').toUpperCase()}
          </Txt>
        </View>
      </Pressable>

      <View style={{ gap: 2 }}>
        {sections.map((label) => {
          const on = label === active;
          return (
            <Pressable
              key={label}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={label}
              onPress={() => onSelect(label)}
              style={{
                paddingVertical: 9,
                paddingHorizontal: 10,
                borderRadius: radius.chip,
                backgroundColor: on ? 'rgba(243,238,229,.08)' : 'transparent',
              }}
            >
              <Txt size={12} weight={on ? 'semibold' : 'regular'} color={on ? operative.bg : onVoidDim}>
                {label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const onVoidDim = 'rgba(243,238,229,.45)';

function TopBar({ section }: { section: Section }) {
  return (
    <View
      style={{
        height: 52,
        paddingHorizontal: 22,
        borderBottomWidth: 1,
        borderBottomColor: onOperative.hairline,
        backgroundColor: operative.surface,
        justifyContent: 'center',
      }}
    >
      <Txt size={14} weight="bold" em={-0.01} color={ink}>
        {section}
      </Txt>
    </View>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  /** An optional control in the panel's header band — Refresh, mostly. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        borderRadius: radius.panel,
        backgroundColor: operative.surface,
        borderWidth: 1,
        borderColor: onOperative.hairline,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          paddingVertical: 10,
          paddingHorizontal: 14,
          backgroundColor: operative.band,
          borderBottomWidth: 1,
          borderBottomColor: onOperative.hairline,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <Txt size={9.5} weight="semibold" em={0.14} upper color={onOperative.faint}>
          {title}
        </Txt>
        {action}
      </View>
      <View style={{ padding: 14, gap: 10 }}>{children}</View>
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(20,18,16,.06)',
      }}
    >
      {children}
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <Txt size={12} color={onOperative.dim}>
      {text}
    </Txt>
  );
}

// ---------------------------------------------------------------------------
// A-01 Overview
// ---------------------------------------------------------------------------

function Overview() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLive) return;
    adminOverview().then(setData).catch(() => setError('Could not read the platform overview.'));
  }, []);

  const kpis = data
    ? [
        { label: 'VENUES', value: `${data.venuesVerified}/${data.venuesTotal}`, sub: 'verified', tone: 'neutral' as const },
        { label: 'PLAYERS', value: `${data.players}`, sub: 'accounts', tone: 'neutral' as const },
        { label: 'BOOKINGS', value: `${data.bookings}`, sub: '30 days', tone: 'neutral' as const },
        { label: 'GMV', value: `${data.gmvEgp}`, sub: 'EGP · 30 days', tone: 'gold' as const },
        { label: 'NO-SHOWS', value: `${data.noShowRate}%`, sub: 'of bookings', tone: data.noShowRate > 10 ? ('alert' as const) : ('neutral' as const) },
        { label: 'REPORTS', value: `${data.openReports}`, sub: 'open', tone: data.openReports > 0 ? ('alert' as const) : ('neutral' as const) },
      ]
    : [];

  return (
    <>
      <OpNotice text={error} />
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {kpis.map((kpi) => (
          <View
            key={kpi.label}
            style={{
              flex: 1,
              minWidth: 130,
              padding: 13,
              borderRadius: radius.panel,
              backgroundColor: operative.surface,
              borderWidth: 1,
              borderColor:
                kpi.tone === 'gold'
                  ? 'rgba(198,163,75,.5)'
                  : kpi.tone === 'alert'
                    ? 'rgba(139,33,53,.35)'
                    : onOperative.hairline,
              gap: 6,
            }}
          >
            <Txt size={9.5} weight="semibold" em={0.14} color={onOperative.faint}>
              {kpi.label}
            </Txt>
            <Txt
              size={22}
              weight="bold"
              em={-0.02}
              color={kpi.tone === 'gold' ? gold.ink : kpi.tone === 'alert' ? burgundy.ink : ink}
            >
              {kpi.value}
            </Txt>
            <Txt size={10} color="rgba(20,18,16,.42)">
              {kpi.sub}
            </Txt>
          </View>
        ))}
        {!data && !error ? <ActivityIndicator color={ink} /> : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
        <View style={{ flex: 1.55 }}>
          <Ledger compact />
        </View>
        <View style={{ flex: 1, gap: 16 }}>
          <Moderation compact />
        </View>
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// A-02 Venues
// ---------------------------------------------------------------------------

function Venues() {
  const [rows, setRows] = useState<PendingVenue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!isLive) return;
    adminVerificationQueue()
      .then(setRows)
      .catch(() => setError('Not authorised to read the verification queue.'));
  }, [nonce]);

  const decide = async (venueId: string, verification: 'verified' | 'rejected') => {
    const res = await adminSetVerification(venueId, verification);
    if (!res.ok) setError(res.reason ?? null);
    else setError(null);
    setNonce((n) => n + 1);
  };

  return (
    <>
      <OpNotice text={error} />
      <Panel title="Awaiting verification">
        {rows.length === 0 ? <Empty text="Nothing waiting. Every venue is verified." /> : null}
        {rows.map((v) => (
          <Row key={v.venueId}>
            <View style={{ flex: 1, gap: 3 }}>
              <Txt size={13} weight="semibold" color={ink}>
                {v.name}
              </Txt>
              <Txt size={10.5} color="rgba(20,18,16,.45)">
                {[v.area, v.phone, `${v.pitches} pitches`, `${v.bookings} bookings`]
                  .filter(Boolean)
                  .join(' · ')}
              </Txt>
            </View>
            <Txt size={11} color={onOperative.dim} style={{ width: 70 }}>
              {v.verification}
            </Txt>
            <OpButton label="Verify" onPress={() => decide(v.venueId, 'verified')} />
            <OpButton label="Reject" tone="danger" onPress={() => decide(v.venueId, 'rejected')} />
          </Row>
        ))}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// A-04 Users
// ---------------------------------------------------------------------------

function Users() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!isLive) return;
    const timer = setTimeout(() => {
      adminFindUsers(query || undefined)
        .then(setRows)
        .catch(() => setError('Not authorised to read users.'));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, nonce]);

  const suspend = async (playerId: string, days: number) => {
    const res = await adminSuspendUser(playerId, days, days > 0 ? 'Moderation action' : undefined);
    if (!res.ok) setError(res.reason ?? null);
    else setError(null);
    setNonce((n) => n + 1);
  };

  return (
    <>
      <OpNotice text={error} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search by name"
        placeholderTextColor="rgba(20,18,16,.32)"
        style={{
          height: 40,
          paddingHorizontal: 12,
          borderRadius: radius.chip,
          borderWidth: 1,
          borderColor: onOperative.hairline,
          backgroundColor: operative.surface,
          color: ink,
          fontSize: 13,
        }}
      />
      <Panel title="Accounts">
        {rows.length === 0 ? <Empty text="No accounts match that." /> : null}
        {rows.map((u) => (
          <Row key={u.playerId}>
            <View style={{ flex: 1, gap: 3 }}>
              <Txt size={13} weight="semibold" color={ink}>
                {u.displayName}
              </Txt>
              <Txt size={10.5} color="rgba(20,18,16,.45)">
                {[u.area, `${u.bookings} bookings`, u.noShows > 0 ? `${u.noShows} no-shows` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Txt>
            </View>
            {u.suspendedUntil ? (
              <Txt size={11} color={burgundy.ink} style={{ width: 120 }}>
                suspended
              </Txt>
            ) : (
              <Txt size={11} color={onOperative.dim} style={{ width: 120 }}>
                {u.visibility}
              </Txt>
            )}
            {u.suspendedUntil ? (
              <OpButton label="Reinstate" tone="quiet" onPress={() => suspend(u.playerId, 0)} />
            ) : (
              <OpButton label="Suspend 7d" tone="danger" onPress={() => suspend(u.playerId, 7)} />
            )}
          </Row>
        ))}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// A-03 Moderation
// ---------------------------------------------------------------------------

function Moderation({ compact }: { compact?: boolean } = {}) {
  const [rows, setRows] = useState<AdminReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!isLive) return;
    adminReports('open', compact ? 6 : 50)
      .then(setRows)
      .catch(() => setError('Not authorised to read the moderation queue.'));
  }, [nonce, compact]);

  const resolve = async (id: string, state: 'actioned' | 'dismissed') => {
    const res = await adminResolveReport(id, state);
    if (!res.ok) setError(res.reason ?? null);
    else setError(null);
    setNonce((n) => n + 1);
  };

  return (
    <>
      <OpNotice text={error} />
      <Panel title="Needs attention">
        {rows.length === 0 ? <Empty text="Nothing reported." /> : null}
        {rows.map((r) => (
          <Row key={r.reportId}>
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: radius.pill,
                backgroundColor: r.reason === 'unsafe' ? burgundy.ink : gold.border,
              }}
            />
            <View style={{ flex: 1, gap: 3 }}>
              <Txt size={12.5} weight="semibold" color={ink}>
                {r.subjectName ?? r.subjectKind} · {r.reason}
              </Txt>
              <Txt size={10.5} color="rgba(20,18,16,.45)" numberOfLines={compact ? 1 : 3}>
                {r.body ?? `Reported by ${r.reporter}`}
              </Txt>
            </View>
            {!compact ? (
              <>
                <OpButton label="Action" onPress={() => resolve(r.reportId, 'actioned')} />
                <OpButton label="Dismiss" tone="quiet" onPress={() => resolve(r.reportId, 'dismissed')} />
              </>
            ) : null}
          </Row>
        ))}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// A-05 Ledger
// ---------------------------------------------------------------------------

function Ledger({ compact }: { compact?: boolean } = {}) {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Read on every mount and on demand. `[]` meant an operator who actioned a
  // report or verified a venue in another panel came back to figures from
  // whenever they first opened the console.
  useEffect(() => {
    if (!isLive) return;
    adminLedger()
      .then(setRows)
      .catch(() => setError('Not authorised to read the ledger.'));
  }, [nonce]);

  const total = rows.reduce(
    (acc, r) => ({
      gross: acc.gross + r.grossEgp,
      collected: acc.collected + r.collectedEgp,
      outstanding: acc.outstanding + r.outstandingEgp,
    }),
    { gross: 0, collected: 0, outstanding: 0 },
  );

  return (
    <>
      <OpNotice text={error} />
      <Panel title="Ledger · 30 days">
        <Row>
          <Txt size={9.5} weight="semibold" em={0.12} upper color={onOperative.faint} style={{ flex: 1 }}>
            Venue
          </Txt>
          {(['Gross', 'Collected', 'Due'] as const).map((h) => (
            <Txt
              key={h}
              size={9.5}
              weight="semibold"
              em={0.12}
              upper
              color={onOperative.faint}
              style={{ width: 78, textAlign: 'right' }}
            >
              {h}
            </Txt>
          ))}
        </Row>
        {rows.length === 0 ? <Empty text="No trading venues in this window." /> : null}
        {(compact ? rows.slice(0, 6) : rows).map((r) => (
          <Row key={r.venueId}>
            <Txt size={12.5} color={ink} style={{ flex: 1 }} numberOfLines={1}>
              {r.venueName}
            </Txt>
            <Txt size={12} color={ink} style={{ width: 78, textAlign: 'right', fontFamily: mono }}>
              {r.grossEgp}
            </Txt>
            <Txt size={12} color={status.positive} style={{ width: 78, textAlign: 'right', fontFamily: mono }}>
              {r.collectedEgp}
            </Txt>
            <Txt
              size={12}
              color={r.outstandingEgp > 0 ? gold.ink : onOperative.dim}
              style={{ width: 78, textAlign: 'right', fontFamily: mono }}
            >
              {r.outstandingEgp}
            </Txt>
          </Row>
        ))}
        <Row>
          <Txt size={12} weight="semibold" color={ink} style={{ flex: 1 }}>
            Total
          </Txt>
          {[total.gross, total.collected, total.outstanding].map((v, i) => (
            <Txt
              key={i}
              size={12}
              weight="semibold"
              color={ink}
              style={{ width: 78, textAlign: 'right', fontFamily: mono }}
            >
              {v}
            </Txt>
          ))}
        </Row>
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// A-07 Settings
// ---------------------------------------------------------------------------

function Settings() {
  const [rows, setRows] = useState<Setting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(() => {
    if (!isLive) return;
    adminSettings()
      .then((s) => {
        setRows(s);
        setDrafts(Object.fromEntries(s.map((x) => [x.key, String(x.value)])));
      })
      .catch(() => setError('Not authorised to read platform settings.'));
  }, []);

  useEffect(load, [load, nonce]);

  return (
    <>
      <OpNotice text={error} />
      <Panel title="Policy">
        {rows.length === 0 ? <Empty text="No settings." /> : null}
        {rows.map((s) => (
          <Row key={s.key}>
            <View style={{ flex: 1, gap: 3 }}>
              <Txt size={12.5} weight="semibold" color={ink}>
                {s.key}
              </Txt>
              <Txt size={10.5} lh={1.45} color="rgba(20,18,16,.45)">
                {s.description}
              </Txt>
            </View>
            <TextInput
              value={drafts[s.key] ?? ''}
              onChangeText={(v) => setDrafts((d) => ({ ...d, [s.key]: v }))}
              keyboardType="number-pad"
              style={{
                width: 74,
                height: 36,
                paddingHorizontal: 10,
                borderRadius: radius.chip,
                borderWidth: 1,
                borderColor: onOperative.hairline,
                backgroundColor: operative.bg,
                color: ink,
                fontSize: 13,
                textAlign: 'right',
              }}
            />
            <OpButton
              label="Save"
              disabled={drafts[s.key] === String(s.value)}
              onPress={async () => {
                const res = await adminSetSetting(s.key, Number(drafts[s.key]));
                if (!res.ok) setError(res.reason ?? null);
                else setError(null);
                setNonce((n) => n + 1);
              }}
            />
          </Row>
        ))}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// A-08 Audit
// ---------------------------------------------------------------------------

function Audit() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // The audit log is the one panel most likely to be read straight after
  // acting somewhere else in the console, and it was the one that never
  // re-read.
  useEffect(() => {
    if (!isLive) return;
    adminAudit(120)
      .then(setRows)
      .catch(() => setError('Not authorised to read the audit log.'));
  }, [nonce]);

  return (
    <>
      <OpNotice text={error} />
      <Panel title="Every privileged action" action={<OpButton label="Refresh" tone="quiet" onPress={() => setNonce((n) => n + 1)} />}>
        {rows.length === 0 ? <Empty text="Nothing recorded yet." /> : null}
        {rows.map((a, i) => (
          <Row key={i}>
            <Txt size={11} color={onOperative.dim} style={{ width: 128, fontFamily: mono }}>
              {new Date(a.at).toLocaleString('en-GB', {
                timeZone: 'Africa/Cairo',
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Txt>
            <Txt size={12} weight="semibold" color={ink} style={{ width: 150 }} numberOfLines={1}>
              {a.action}
            </Txt>
            <Txt size={11.5} color="rgba(20,18,16,.55)" style={{ flex: 1 }} numberOfLines={1}>
              {a.actor}
            </Txt>
            <Txt size={11} color={onOperative.dim} style={{ flex: 1, fontFamily: mono }} numberOfLines={1}>
              {JSON.stringify(a.detail)}
            </Txt>
          </Row>
        ))}
      </Panel>
    </>
  );
}
