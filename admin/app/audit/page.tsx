'use client';

import { useCallback } from 'react';
import { Empty, Messages, Page, useSection, when } from '@/components/Page';
import { audit, type AuditEntry } from '@/lib/admin';

/**
 * ADM-012: everything privileged anybody did, and to what.
 *
 * booking_event records a booking's own life; this records reach beyond what
 * you own — a price change, a verification, a suspension, a password reset.
 * It is append-only and nothing on this page can edit it, which is the only
 * property that makes an audit log worth having.
 */
export default function AuditPage() {
  const fetch = useCallback(() => audit(200), []);
  const { data, loading, error, note } = useSection<AuditEntry[]>(fetch, []);

  return (
    <Page title="Audit" blurb="Every privileged action, in order. Nothing here can be edited.">
      <Messages error={error} note={note} />

      <div className="panel">
        {loading ? (
          <Empty>Loading…</Empty>
        ) : data.length === 0 ? (
          <Empty>Nothing recorded yet.</Empty>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Did</th>
                  <th>To</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {data.map((a, i) => (
                  <tr key={`${a.at}-${i}`}>
                    <td className="muted">{when(a.at)}</td>
                    <td style={{ fontWeight: 600 }}>{a.actor}</td>
                    <td>
                      <span className="chip">{a.action}</span>
                    </td>
                    <td className="muted">
                      {a.subjectKind}
                      {a.subjectId ? <div className="faint mono">{a.subjectId.slice(0, 8)}</div> : null}
                    </td>
                    <td className="mono muted" style={{ maxWidth: 340, wordBreak: 'break-word' }}>
                      {Object.keys(a.detail).length ? JSON.stringify(a.detail) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Page>
  );
}
