import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from '@/components/Txt';
import { VoidMark } from '@/components/VoidMark';
import { burgundy, console_, gold, ink, onOperative, onVoid, operative, radius, status, void_ } from '@/theme/tokens';
import { mono } from '@/theme/typography';
import { ADMIN_KPIS, ADMIN_NAV, ADMIN_USER, ATTENTION, AUDIT, KpiTone, LEDGER, LEDGER_FOOTER, LedgerRow } from '@/data/admin';
import { AdminSectionBody } from '@/components/adminSections';

/**
 * A-01 Overview — monitor the platform (§4.6).
 *
 * The console is a protected responsive web surface, so it keeps its own fixed
 * canvas rather than collapsing to a phone layout: an operator reading the
 * ledger needs the columns side by side. On a narrow screen it pans.
 */
export default function AdminConsole() {
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState('Overview');

  return (
    <View style={{ flex: 1, backgroundColor: operative.bg, paddingTop: insets.top }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ width: console_.width, flex: 1, flexDirection: 'row' }}>
          <Rail section={section} onSection={setSection} />
          <View style={{ flex: 1 }}>
            <TopBar section={section} />
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingVertical: 20, paddingHorizontal: 22, gap: 18 }}
              showsVerticalScrollIndicator={false}
            >
              {section === 'Overview' ? (
                <>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {ADMIN_KPIS.map((kpi) => (
                      <Kpi key={kpi.label} {...kpi} />
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
                    <View style={{ flex: 1.55 }}>
                      <Ledger />
                    </View>
                    <View style={{ flex: 1, gap: 16 }}>
                      <NeedsAttention />
                      <AuditTrail />
                    </View>
                  </View>
                </>
              ) : (
                <AdminSectionBody section={section} />
              )}
            </ScrollView>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Rail({ section, onSection }: { section: string; onSection: (s: string) => void }) {
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
            ADMIN
          </Txt>
        </View>
      </Pressable>

      <View style={{ gap: 2 }}>
        {ADMIN_NAV.map((item) => {
          const on = item.label === section;
          return (
            <Pressable
              key={item.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={item.badge ? `${item.label}, ${item.badge} items` : item.label}
              onPress={() => onSection(item.label)}
              style={{
                paddingVertical: 9,
                paddingHorizontal: 10,
                borderRadius: radius.denseChip,
                backgroundColor: on ? 'rgba(198,163,75,.16)' : 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Txt size={12.5} weight={on ? 'semibold' : 'medium'} color={on ? gold.base : 'rgba(243,238,229,.62)'}>
                {item.label}
              </Txt>
              {item.badge ? (
                <Txt size={10} color={gold.base}>
                  {item.badge}
                </Txt>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View style={{ flex: 1 }} />

      {/* ADM-012 / RBAC-004: who is acting is part of the record. */}
      <View
        style={{
          padding: 10,
          borderRadius: radius.denseChip,
          borderWidth: 1,
          borderColor: 'rgba(243,238,229,.1)',
          gap: 4,
        }}
      >
        <Txt size={10} weight="semibold" em={0.14} color={onVoid.dim}>
          SIGNED IN
        </Txt>
        <Txt size={12} weight="semibold" color={operative.bg}>
          {ADMIN_USER.role}
        </Txt>
        <Txt size={10.5} color={onVoid.dim}>
          {ADMIN_USER.scope}
        </Txt>
      </View>
    </View>
  );
}

function TopBar({ section }: { section: string }) {
  return (
    <View
      style={{
        height: 56,
        borderBottomWidth: 1,
        borderBottomColor: onOperative.hairline,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        paddingHorizontal: 22,
        backgroundColor: operative.surface,
      }}
    >
      <Txt size={15} weight="bold" em={-0.01} color={ink}>
        {section}
      </Txt>
      <Txt size={11} color={onOperative.faint}>
        Tue 18 Aug 2026 · 21:41 EET
      </Txt>
      <View style={{ flex: 1 }} />
      <View
        style={{
          height: 32,
          width: 260,
          borderRadius: radius.denseChip,
          borderWidth: 1,
          borderColor: 'rgba(20,18,16,.16)',
          justifyContent: 'center',
          paddingHorizontal: 12,
        }}
      >
        <Txt size={11.5} color={onOperative.dim}>
          Search booking, venue, user or code…
        </Txt>
      </View>
      {/* ADM-009: exports carry permission, purpose and an audit trail. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Export"
        style={({ pressed }) => ({
          height: 32,
          paddingHorizontal: 12,
          borderRadius: radius.denseChip,
          backgroundColor: void_.bg,
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Txt size={11.5} weight="semibold" color={operative.bg}>
          Export
        </Txt>
      </Pressable>
    </View>
  );
}

const KPI_TONE: Record<KpiTone, { border: string; fg: string }> = {
  neutral: { border: onOperative.hairline, fg: ink },
  gold: { border: 'rgba(198,163,75,.55)', fg: gold.ink },
  alert: { border: 'rgba(101,21,37,.3)', fg: burgundy.ink },
};

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: KpiTone }) {
  const spec = KPI_TONE[tone];
  return (
    <View
      style={{
        flex: 1,
        padding: 14,
        borderRadius: radius.panel,
        backgroundColor: operative.surface,
        borderWidth: 1,
        borderColor: spec.border,
        gap: 7,
      }}
    >
      <Txt size={9.5} weight="semibold" em={0.14} color={onOperative.faint}>
        {label}
      </Txt>
      <Txt size={24} weight="bold" em={-0.025} color={spec.fg}>
        {value}
      </Txt>
      <Txt size={10.5} color={onOperative.faint}>
        {sub}
      </Txt>
    </View>
  );
}

/** Column widths straight from the design's grid template. */
const COLS = { code: 96, venue: 1.3, captain: 1, source: 78, deposit: 92, status: 84 };

function Ledger() {
  const [filter, setFilter] = useState('All');

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
          paddingVertical: 13,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: onOperative.edge,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Txt size={12.5} weight="bold" color={ink}>
          Live booking ledger
        </Txt>
        <View style={{ width: 6, height: 6, borderRadius: radius.pill, backgroundColor: gold.base }} />
        <Txt size={10.5} color="rgba(20,18,16,.42)">
          every channel, one truth
        </Txt>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', gap: 5 }}>
          {['All', 'App', 'Failed'].map((f) => {
            const on = f === filter;
            return (
              <Pressable
                key={f}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${f} bookings`}
                onPress={() => setFilter(f)}
                style={{
                  paddingVertical: 4,
                  paddingHorizontal: 9,
                  borderRadius: 6,
                  ...(on
                    ? { backgroundColor: void_.bg }
                    : { borderWidth: 1, borderColor: 'rgba(20,18,16,.16)' }),
                }}
              >
                <Txt size={10.5} weight={on ? 'semibold' : 'regular'} color={on ? operative.bg : 'rgba(20,18,16,.55)'}>
                  {f}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          paddingVertical: 8,
          paddingHorizontal: 16,
          backgroundColor: operative.band,
        }}
      >
        {(['CODE', 'VENUE / PITCH', 'CAPTAIN', 'SOURCE', 'DEPOSIT', 'STATUS'] as const).map((h, i) => (
          <View
            key={h}
            style={
              i === 0
                ? { width: COLS.code }
                : i === 1
                  ? { flex: COLS.venue }
                  : i === 2
                    ? { flex: COLS.captain }
                    : i === 3
                      ? { width: COLS.source }
                      : i === 4
                        ? { width: COLS.deposit }
                        : { width: COLS.status }
            }
          >
            <Txt size={9.5} weight="bold" em={0.1} color={onOperative.muted}>
              {h}
            </Txt>
          </View>
        ))}
      </View>

      {LEDGER.map((row) => (
        <LedgerRowView key={row.code} row={row} />
      ))}

      <View style={{ paddingVertical: 11, paddingHorizontal: 16 }}>
        <Txt size={11} color="rgba(20,18,16,.42)">
          {LEDGER_FOOTER}
        </Txt>
      </View>
    </View>
  );
}

function LedgerRowView({ row }: { row: LedgerRow }) {
  const rowBg =
    row.kind === 'new' ? 'rgba(198,163,75,.1)' : row.kind === 'fail' ? 'rgba(101,21,37,.06)' : 'transparent';
  const codeFg = row.kind === 'new' ? gold.ink : row.kind === 'fail' ? burgundy.ink : 'rgba(20,18,16,.75)';
  const depositFg =
    row.deposit === 'Unpaid' ? burgundy.ink : row.deposit === 'Cash · due' ? gold.ink : 'rgba(20,18,16,.6)';
  const statusFg =
    row.status === 'FAILED' ? burgundy.ink : row.status === 'CONFIRMED' ? status.positive : onOperative.muted;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: onOperative.edgeFaint,
        backgroundColor: rowBg,
      }}
    >
      <View style={{ width: COLS.code }}>
        <Txt size={11} weight="semibold" color={codeFg} style={{ fontFamily: mono }}>
          {row.code}
        </Txt>
      </View>
      <View style={{ flex: COLS.venue }}>
        <Txt size={11.5} color={ink}>
          {row.venue}
        </Txt>
      </View>
      <View style={{ flex: COLS.captain }}>
        <Txt size={11.5} color={onOperative.secondary}>
          {row.captain}
        </Txt>
      </View>
      <View style={{ width: COLS.source }}>
        <Txt size={10.5} color={onOperative.muted}>
          {row.source}
        </Txt>
      </View>
      <View style={{ width: COLS.deposit }}>
        <Txt size={11} weight={row.deposit === 'Paid' ? 'medium' : 'semibold'} color={depositFg}>
          {row.deposit}
        </Txt>
      </View>
      <View style={{ width: COLS.status }}>
        <Txt size={10} weight="bold" em={0.06} color={statusFg}>
          {row.status}
        </Txt>
      </View>
    </View>
  );
}

function NeedsAttention() {
  return (
    <View
      style={{
        borderRadius: radius.panel,
        backgroundColor: operative.surface,
        borderWidth: 1,
        borderColor: 'rgba(101,21,37,.28)',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          paddingVertical: 12,
          paddingHorizontal: 15,
          borderBottomWidth: 1,
          borderBottomColor: onOperative.edge,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Txt size={12.5} weight="bold" color={ink}>
          Needs attention
        </Txt>
        <View
          style={{
            backgroundColor: 'rgba(101,21,37,.1)',
            paddingVertical: 3,
            paddingHorizontal: 7,
            borderRadius: radius.badge,
          }}
        >
          <Txt size={10} weight="bold" color={burgundy.ink}>
            {ATTENTION.length + 1}
          </Txt>
        </View>
      </View>
      {ATTENTION.map((item, i) => (
        <View
          key={item.title}
          style={{
            paddingVertical: 12,
            paddingHorizontal: 15,
            gap: 3,
            ...(i < ATTENTION.length - 1
              ? { borderBottomWidth: 1, borderBottomColor: onOperative.edgeFaint }
              : null),
          }}
        >
          <Txt size={12} weight="semibold" color={item.severe ? burgundy.ink : ink}>
            {item.title}
          </Txt>
          <Txt size={11} lh={1.5} color="rgba(20,18,16,.55)">
            {item.detail}
          </Txt>
        </View>
      ))}
    </View>
  );
}

function AuditTrail() {
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
          paddingVertical: 12,
          paddingHorizontal: 15,
          borderBottomWidth: 1,
          borderBottomColor: onOperative.edge,
        }}
      >
        <Txt size={12.5} weight="bold" color={ink}>
          Audit trail · XL-7K42
        </Txt>
      </View>
      <View style={{ paddingVertical: 12, paddingHorizontal: 15, gap: 11 }}>
        {AUDIT.map((entry) => (
          <View key={entry.at + entry.event} style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
            <Txt size={10} color={onOperative.dim} style={{ width: 44, paddingTop: 1, fontFamily: mono }}>
              {entry.at}
            </Txt>
            <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: onOperative.hairline }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt size={11.5} weight="semibold" color={ink}>
                {entry.event}
              </Txt>
              <Txt size={10.5} color="rgba(20,18,16,.48)">
                {entry.actor}
              </Txt>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
