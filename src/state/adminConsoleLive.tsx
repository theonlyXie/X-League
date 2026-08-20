import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as adminApi from '@/data/adminApi';
import type { LedgerRow } from '@/data/admin';
import { ADMIN_NAV } from '@/data/admin';
import { useSession } from '@/state/session';
import type { AdminConsoleContextValue } from '@/state/adminConsoleTypes';

const AdminConsoleContext = createContext<AdminConsoleContextValue | null>(null);

const STATIC_NAV = ADMIN_NAV.filter((n) => n.label !== 'Venues');

export function LiveAdminConsoleProvider({ children }: { children: ReactNode }) {
  const { displayName, isAdmin } = useSession();
  const [ready, setReady] = useState(false);
  const [asOf, setAsOf] = useState('');
  const [kpis, setKpis] = useState<AdminConsoleContextValue['kpis']>([]);
  const [attention, setAttention] = useState<AdminConsoleContextValue['attention']>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [audit, setAudit] = useState<AdminConsoleContextValue['audit']>([]);
  const [venues, setVenues] = useState<AdminConsoleContextValue['venues']>([]);
  const [pendingVenues, setPendingVenues] = useState(0);

  const loadOverview = useCallback(async () => {
    const overview = await adminApi.fetchAdminOverview();
    setKpis(overview.kpis);
    setAttention(overview.attention);
    setPendingVenues(overview.pendingVenues);
    setLedgerTotal(overview.bookingsToday);
    setAsOf(overview.asOf);
  }, []);

  const loadLedger = useCallback(async (filter: 'all' | 'app' | 'failed' = 'all') => {
    setLedger(await adminApi.fetchAdminLedger(filter));
  }, []);

  const loadRest = useCallback(async () => {
    const [auditRows, venueRows] = await Promise.all([adminApi.fetchAdminAudit(), adminApi.fetchAdminVenues()]);
    setAudit(auditRows);
    setVenues(venueRows);
  }, []);

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    await Promise.all([loadOverview(), loadLedger('all'), loadRest()]);
  }, [isAdmin, loadOverview, loadLedger, loadRest]);

  const refreshLedger = useCallback(
    async (filter: 'all' | 'app' | 'failed') => {
      if (!isAdmin) return;
      await loadLedger(filter);
    },
    [isAdmin, loadLedger],
  );

  useEffect(() => {
    if (!isAdmin) {
      setReady(true);
      return;
    }
    refresh().finally(() => setReady(true));
    const timer = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(timer);
  }, [isAdmin, refresh]);

  const nav = useMemo(
    () => [
      { label: 'Overview', badge: '' },
      { label: 'Venues', badge: pendingVenues > 0 ? String(pendingVenues) : '' },
      ...STATIC_NAV.slice(1),
    ],
    [pendingVenues],
  );

  const value = useMemo<AdminConsoleContextValue>(
    () => ({
      ready,
      isAdmin,
      user: {
        role: displayName ? `Ops · ${displayName.split(' ')[0]}.` : 'Ops',
        scope: 'Super admin · audited',
      },
      nav,
      asOf,
      kpis,
      attention,
      ledger,
      ledgerFooter: `Showing ${ledger.length} of ${ledgerTotal} today · immutable audit record written for every state change`,
      audit,
      venues,
      refresh,
      refreshLedger,
    }),
    [
      ready,
      isAdmin,
      displayName,
      nav,
      asOf,
      kpis,
      attention,
      ledger,
      ledgerTotal,
      audit,
      venues,
      refresh,
      refreshLedger,
    ],
  );

  return <AdminConsoleContext.Provider value={value}>{children}</AdminConsoleContext.Provider>;
}

export function useLiveAdminConsole() {
  const ctx = useContext(AdminConsoleContext);
  if (!ctx) throw new Error('useLiveAdminConsole must be used inside LiveAdminConsoleProvider');
  return ctx;
}
