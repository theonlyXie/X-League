'use client';

import { useCallback, useState } from 'react';
import { canAct } from '@/components/Gate';
import { Empty, Messages, Page, useSection, when } from '@/components/Page';
import { useSession } from '@/lib/session';
import { setSetting, settings, type Setting } from '@/lib/admin';

/**
 * The policy numbers, as data rather than as constants in a migration.
 *
 * The cancellation cutoff and the no-show threshold live here because they are
 * decisions the platform revisits, and a decision that needs a deploy to change
 * is a decision nobody makes. Every change is audited.
 */
export default function SettingsPage() {
  const { role } = useSession();
  const may = canAct(role);
  const fetch = useCallback(() => settings(), []);
  const { data, loading, error, note, busy, run } = useSection<Setting[]>(fetch, []);

  return (
    <Page title="Settings" blurb="Policy the platform runs on. Every change is recorded.">
      <Messages error={error} note={note} />

      <div className="panel">
        {loading ? (
          <Empty>Loading…</Empty>
        ) : data.length === 0 ? (
          <Empty>No settings defined.</Empty>
        ) : (
          <div className="grid">
            {data.map((s) => (
              <SettingRow key={s.key} s={s} may={may} busy={busy} run={run} />
            ))}
          </div>
        )}
      </div>
    </Page>
  );
}

function SettingRow({
  s,
  may,
  busy,
  run,
}: {
  s: Setting;
  may: boolean;
  busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; reason?: string }>, said: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(String(s.value));
  const changed = Number(value) !== s.value;

  return (
    <div
      className="row"
      style={{
        padding: '12px 0',
        borderBottom: '1px solid var(--hairline)',
        alignItems: 'flex-start',
      }}
    >
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontWeight: 600 }}>{s.description ?? s.key}</div>
        <div className="faint mono">{s.key}</div>
        {s.updatedAt ? <div className="faint">Last changed {when(s.updatedAt)}</div> : null}
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={!may}
        aria-label={s.key}
        style={{ width: 110 }}
      />
      {may ? (
        <button
          className={changed ? 'primary' : undefined}
          disabled={busy || !changed}
          onClick={() => void run(() => setSetting(s.key, Number(value)), `${s.key} updated.`)}
        >
          Save
        </button>
      ) : null}
    </div>
  );
}
