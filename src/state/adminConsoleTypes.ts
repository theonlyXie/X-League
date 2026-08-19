import type { AdminAttention, AdminAudit, AdminKpi, AdminVenueRow } from '@/data/adminApi';
import type { KpiTone, LedgerRow } from '@/data/admin';
import {
  ADMIN_KPIS,
  ADMIN_NAV,
  ADMIN_USER,
  ADMIN_VENUES,
  ATTENTION,
  AUDIT,
  LEDGER,
  LEDGER_FOOTER,
} from '@/data/admin';

export type AdminConsoleContextValue = {
  ready: boolean;
  isAdmin: boolean;
  user: { role: string; scope: string };
  nav: { label: string; badge: string }[];
  asOf: string;
  kpis: { label: string; value: string; sub: string; tone: KpiTone }[];
  attention: AdminAttention[];
  ledger: LedgerRow[];
  ledgerFooter: string;
  audit: AdminAudit[];
  venues: AdminVenueRow[];
  refresh: () => Promise<void>;
  refreshLedger: (filter: 'all' | 'app' | 'failed') => Promise<void>;
};

export function demoAdminValue(): AdminConsoleContextValue {
  return {
    ready: true,
    isAdmin: true,
    user: { role: ADMIN_USER.role, scope: ADMIN_USER.scope },
    nav: ADMIN_NAV,
    asOf: 'Tue 18 Aug 2026 · 21:41 EET',
    kpis: ADMIN_KPIS,
    attention: ATTENTION,
    ledger: LEDGER,
    ledgerFooter: LEDGER_FOOTER,
    audit: AUDIT,
    venues: ADMIN_VENUES.map((v) => ({
      name: v.name,
      area: v.area,
      pitches: v.pitches,
      occupancy: v.occupancy,
      drift: v.drift,
      status: v.status,
    })),
    refresh: async () => {},
    refreshLedger: async () => {},
  };
}
