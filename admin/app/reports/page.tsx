'use client';

import { useCallback, useState } from 'react';
import { canAct } from '@/components/Gate';
import { Empty, Messages, Page, useSection, when } from '@/components/Page';
import { useSession } from '@/lib/session';
import { reports, resolveReport, type Report } from '@/lib/admin';

/**
 * ADM-009: what players have reported, and what was done about it.
 *
 * A report is closed with a state rather than deleted, so the decision stays
 * on the record — moderation nobody can review afterwards is not moderation.
 */
export default function ReportsPage() {
  const { role } = useSession();
  const may = canAct(role);
  const [state, setState] = useState('open');

  const fetch = useCallback(() => reports(state), [state]);
  const { data, loading, error, note, busy, load, run } = useSection<Report[]>(fetch, []);

  return (
    <Page
      title="Reports"
      blurb="What players have reported, and what happened next."
      actions={
        <select
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setTimeout(() => void load(), 0);
          }}
          style={{ width: 'auto' }}
          aria-label="Report state"
        >
          <option value="open">Open</option>
          <option value="reviewing">Reviewing</option>
          <option value="actioned">Actioned</option>
          <option value="dismissed">Dismissed</option>
        </select>
      }
    >
      <Messages error={error} note={note} />

      <div className="panel">
        {loading ? (
          <Empty>Loading…</Empty>
        ) : data.length === 0 ? (
          <Empty>Nothing {state}.</Empty>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Reported</th>
                  <th>By</th>
                  <th>Reason</th>
                  <th>Detail</th>
                  <th>When</th>
                  {may ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.reportId}>
                    <td style={{ fontWeight: 600 }}>
                      {r.subjectName ?? r.subjectId}
                      <div className="faint">{r.subjectKind}</div>
                    </td>
                    <td className="muted">{r.reporter}</td>
                    <td>
                      <span className="chip">{r.reason}</span>
                    </td>
                    <td className="muted" style={{ maxWidth: 320 }}>
                      {r.body ?? '—'}
                    </td>
                    <td className="muted">{when(r.createdAt)}</td>
                    {may ? (
                      <td className="num">
                        <span className="row" style={{ justifyContent: 'flex-end' }}>
                          {r.state !== 'actioned' ? (
                            <button
                              className="small primary"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () => resolveReport(r.reportId, 'actioned'),
                                  'Marked as actioned.',
                                )
                              }
                            >
                              Action
                            </button>
                          ) : null}
                          {r.state !== 'dismissed' ? (
                            <button
                              className="small"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () => resolveReport(r.reportId, 'dismissed'),
                                  'Dismissed.',
                                )
                              }
                            >
                              Dismiss
                            </button>
                          ) : null}
                        </span>
                      </td>
                    ) : null}
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
