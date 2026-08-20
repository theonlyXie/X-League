import { useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from '@/components/Txt';
import { VoidMark } from '@/components/VoidMark';
import { burgundy, console_, gold, ink, onOperative, onVoid, operative, radius, status, void_ } from '@/theme/tokens';
import { mono } from '@/theme/typography';
import { KpiTone, LedgerRow } from '@/data/admin';
import { AdminSectionBody } from '@/components/adminSections';
import { isLive } from '@/lib/supabase';
import { useAdminConsole } from '@/state/adminConsole';
import { useSession } from '@/state/session';
import { useI18n } from '@/i18n';
import type { I18nKey } from '@/i18n';

const ADMIN_NAV_KEYS: Record<string, I18nKey> = {
  Overview: 'admin.overview',
  Venues: 'admin.venues',
  'Users & teams': 'admin.users',
  Tournaments: 'admin.tournaments',
  'Match desk': 'admin.matchDesk',
  Moderation: 'admin.moderation',
  'Points & seasons': 'admin.points',
  Reports: 'admin.reports',
};

/**
 * A-01 Overview — monitor the platform (§4.6).
 *
 * The console is a protected responsive web surface. On wide screens it fills
 * the viewport; on narrow screens it pans horizontally so ledger columns stay
 * side by side.
 */
export default function AdminConsole() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { signedIn, isAdmin, restoring } = useSession();
  const admin = useAdminConsole();
  const [section, setSection] = useState('Overview');

  if (isLive && !restoring && !signedIn) return <Redirect href="/sign-in" />;
  if (isLive && !restoring && signedIn && !isAdmin) return <AdminDenied />;
  if (!admin.ready) {
    return (
      <View style={{ flex: 1, backgroundColor: operative.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={gold.base} />
      </View>
    );
  }

  const canvasWidth = Math.max(width, console_.width);
  const wide = width >= console_.width;

  return (
    <View style={{ flex: 1, backgroundColor: operative.bg, paddingTop: insets.top }}>
      <ScrollView
        horizontal={!wide}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, minWidth: wide ? undefined : canvasWidth }}
      >
        <View style={{ width: wide ? '100%' : canvasWidth, flex: 1, flexDirection: 'row', minHeight: wide ? '100%' : console_.height }}>
          <Rail section={section} onSection={setSection} nav={admin.nav} user={admin.user} />
          <View style={{ flex: 1 }}>
            <TopBar section={section} asOf={admin.asOf} onRefresh={() => void admin.refresh()} />
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingVertical: 20, paddingHorizontal: 22, gap: 18 }}
              showsVerticalScrollIndicator={false}
            >
              {section === 'Overview' ? (
                <>
                  <View style={{ flexDirection: 'row', flexWrap: wide ? 'nowrap' : 'wrap', gap: 10 }}>
                    {admin.kpis.map((kpi) => (
                      <Kpi key={kpi.label} {...kpi} />
                    ))}
                  </View>

                  <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
                    <View style={{ flex: wide ? 1.55 : undefined, width: wide ? undefined : '100%' }}>
                      <Ledger
                        rows={admin.ledger}
                        footer={admin.ledgerFooter}
                        onFilter={(f) => void admin.refreshLedger(f)}
                      />
                    </View>
                    <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', gap: 16 }}>
                      <NeedsAttention items={admin.attention} />
                      <AuditTrail entries={admin.audit} />
                    </View>
                  </View>
                </>
              ) : (
                <AdminSectionBody section={section} liveVenues={admin.venues} />
              )}
            </ScrollView>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function AdminDenied() {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <View style={{ flex: 1, backgroundColor: operative.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
      <Txt size={22} weight="bold" color={ink}>
        {t('admin.accessRequired')}
      </Txt>
      <Txt size={14} color={onOperative.muted} style={{ textAlign: 'center', maxWidth: 360 }}>
        {t('admin.accessBody')}
      </Txt>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace('/')}
        style={({ pressed }) => ({
          marginTop: 8,
          paddingVertical: 12,
          paddingHorizontal: 20,
          borderRadius: radius.dense,
          backgroundColor: void_.bg,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Txt size={13} weight="semibold" color={operative.bg}>
          {t('admin.backApp')}
        </Txt>
      </Pressable>
    </View>
  );
}

function Rail({
  section,
  onSection,
  nav,
  user,
}: {
  section: string;
  onSection: (s: string) => void;
  nav: { label: string; badge: string }[];
  user: { role: string; scope: string };
}) {
  const router = useRouter();
  const { t } = useI18n();
  const labelOf = (label: string) => (ADMIN_NAV_KEYS[label] ? t(ADMIN_NAV_KEYS[label]!) : label);

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
        accessibilityLabel={t('admin.backApp')}
        onPress={() => router.replace('/')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8 }}
      >
        <VoidMark size={22} rings={1} />
        <View style={{ gap: 1 }}>
          <Txt size={12.5} weight="bold" em={0.02} color={operative.bg}>
            {t('admin.brand')}
          </Txt>
          <Txt size={9} weight="semibold" em={0.18} color={gold.base}>
            {t('admin.admin')}
          </Txt>
        </View>
      </Pressable>

      <View style={{ gap: 2 }}>
        {nav.map((item) => {
          const on = item.label === section;
          const shown = labelOf(item.label);
          return (
            <Pressable
              key={item.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={item.badge ? `${shown}, ${item.badge}` : shown}
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
                {shown}
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
          {t('admin.signedIn')}
        </Txt>
        <Txt size={12} weight="semibold" color={operative.bg}>
          {user.role}
        </Txt>
        <Txt size={10.5} color={onVoid.dim}>
          {user.scope}
        </Txt>
        {isLive ? (
          <Txt size={9.5} color={gold.base} style={{ marginTop: 4 }}>
            {t('admin.liveSupabase')}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

function TopBar({ section, asOf, onRefresh }: { section: string; asOf: string; onRefresh: () => void }) {
  const { t, language, setLanguage } = useI18n();
  const nextLang = language === 'ar' ? 'en' : 'ar';
  const langLabel = language === 'ar' ? 'EN' : 'ع';

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
        {ADMIN_NAV_KEYS[section] ? t(ADMIN_NAV_KEYS[section]!) : section}
      </Txt>
      <Txt size={11} color={onOperative.faint}>
        {asOf}
      </Txt>
      <View style={{ flex: 1 }} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nextLang === 'ar' ? t('language.switchToArabic') : t('language.switchToEnglish')}
        onPress={() => void setLanguage(nextLang)}
        style={({ pressed }) => ({
          height: 32,
          minWidth: 36,
          paddingHorizontal: 10,
          borderRadius: radius.denseChip,
          borderWidth: 1,
          borderColor: onOperative.hairline,
          justifyContent: 'center',
          alignItems: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Txt size={12} weight="bold" color={gold.ink}>
          {langLabel}
        </Txt>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.refresh')}
        onPress={onRefresh}
        style={({ pressed }) => ({
          height: 32,
          paddingHorizontal: 12,
          borderRadius: radius.denseChip,
          borderWidth: 1,
          borderColor: onOperative.hairline,
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Txt size={11.5} weight="semibold" color={ink}>
          {t('common.refresh')}
        </Txt>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.export')}
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
          {t('common.export')}
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
        minWidth: 140,
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

const COLS = { code: 96, venue: 1.3, captain: 1, source: 78, deposit: 92, status: 84 };

function Ledger({
  rows,
  footer,
  onFilter,
}: {
  rows: LedgerRow[];
  footer: string;
  onFilter: (f: 'all' | 'app' | 'failed') => void;
}) {
  const [filter, setFilter] = useState<'all' | 'app' | 'failed'>('all');

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
          {(['All', 'App', 'Failed'] as const).map((f) => {
            const key = f === 'All' ? 'all' : f === 'App' ? 'app' : 'failed';
            const on = key === filter;
            return (
              <Pressable
                key={f}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${f} bookings`}
                onPress={() => {
                  setFilter(key);
                  onFilter(key);
                }}
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

      {rows.length ? (
        rows.map((row) => <LedgerRowView key={row.code + row.venue} row={row} />)
      ) : (
        <View style={{ padding: 16 }}>
          <Txt size={12} color={onOperative.muted}>
            No bookings match this filter today.
          </Txt>
        </View>
      )}

      <View style={{ paddingVertical: 11, paddingHorizontal: 16 }}>
        <Txt size={11} color="rgba(20,18,16,.42)">
          {footer}
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
    row.deposit.includes('unpaid')
      ? burgundy.ink
      : row.deposit.includes('due')
        ? gold.ink
        : 'rgba(20,18,16,.6)';
  const statusFg =
    row.status.includes('FAIL') || row.status.includes('CANCEL')
      ? burgundy.ink
      : row.status.includes('CONFIRM') || row.status.includes('CHECKED')
        ? status.positive
        : onOperative.muted;

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

function NeedsAttention({ items }: { items: { title: string; detail: string; severe: boolean }[] }) {
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
            {items.length}
          </Txt>
        </View>
      </View>
      {items.length ? (
        items.map((item, i) => (
          <View
            key={item.title}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 15,
              gap: 3,
              ...(i < items.length - 1
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
        ))
      ) : (
        <View style={{ padding: 15 }}>
          <Txt size={12} color={onOperative.muted}>
            Nothing flagged right now.
          </Txt>
        </View>
      )}
    </View>
  );
}

function AuditTrail({ entries }: { entries: { at: string; event: string; actor: string; bookingCode?: string }[] }) {
  const headline = entries[0]?.bookingCode ? `Audit trail · ${entries[0].bookingCode}` : 'Audit trail';
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
          {headline}
        </Txt>
      </View>
      <View style={{ paddingVertical: 12, paddingHorizontal: 15, gap: 11 }}>
        {entries.map((entry) => (
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
