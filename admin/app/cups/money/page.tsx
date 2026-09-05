'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Gate, canAct } from '@/components/Gate';
import { Notice, Shell } from '@/components/Shell';
import { useSession } from '@/lib/session';
import {
  createPromoCode,
  deletePaymentChannel,
  listForOrganiser,
  paymentChannels,
  promoCodes,
  savePaymentChannel,
  setPromoActive,
  type PaymentChannel,
  type PaymentChannelKind,
  type PromoCode,
  type PromoKind,
  type TournamentSummary,
} from '@/lib/cups';

/**
 * Where entry money goes, and who gets in for less than the asking price.
 *
 * Both live here rather than on a cup's own page because both are usually
 * platform-wide: the accounts are entered once and a particular cup overrides
 * them, and a code an administrator mints for a captain is more often good
 * anywhere than tied to one competition.
 */
export default function MoneySetupPage() {
  return (
    <Gate>
      <Shell>
        <Setup />
      </Shell>
    </Gate>
  );
}

function Setup() {
  const { role } = useSession();
  const may = canAct(role);

  const [cups, setCups] = useState<TournamentSummary[]>([]);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, where, minted] = await Promise.all([
        listForOrganiser(),
        paymentChannels(),
        promoCodes(),
      ]);
      setCups(list);
      setChannels(where);
      setCodes(minted);
      setError(null);
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<{ ok: boolean; reason?: string }>, said: string) => {
    setBusy(true);
    setNote(null);
    setError(null);
    const res = await fn();
    await load();
    if (!res.ok) setError(res.reason ?? 'That was refused.');
    else setNote(said);
    setBusy(false);
  };

  // Channel form
  const [kind, setKind] = useState<PaymentChannelKind>('instapay');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [instructions, setInstructions] = useState('');
  const [forCup, setForCup] = useState('');
  /**
   * The row being corrected, if any.
   *
   * This page could add an account and switch one off, and nothing else — so
   * the one account that most needs correcting, the placeholder somebody enters
   * on day one, could not be corrected here at all. The cup page has had Change
   * and Remove since the day it was written; this is the same pair.
   */
  const [editing, setEditing] = useState<string | null>(null);

  const startEdit = (c: PaymentChannel) => {
    setEditing(c.id);
    setKind(c.kind);
    setLabel(c.label);
    setValue(c.value);
    setInstructions(c.instructions ?? '');
    setForCup(c.tournamentId ?? '');
  };

  const clearEdit = () => {
    setEditing(null);
    setLabel('');
    setValue('');
    setInstructions('');
  };

  // Code form
  const [promoKind, setPromoKind] = useState<PromoKind>('percent');
  const [amount, setAmount] = useState('');
  const [percent, setPercent] = useState('25');
  const [uses, setUses] = useState('1');
  const [promoCup, setPromoCup] = useState('');
  const [promoNote, setPromoNote] = useState('');
  const [minted, setMinted] = useState<string | null>(null);

  if (loading) return <div className="empty">Loading…</div>;

  return (
    <>
      <p className="faint" style={{ marginTop: 0 }}>
        <Link href="/cups">← All cups</Link>
      </p>

      <h1>Entry money</h1>
      <p className="faint">
        Nothing here takes a payment. These are the accounts a captain transfers to, and the codes
        that reduce what they owe — the money arrives out of band and somebody marks it received on
        the cup&rsquo;s own page.
      </p>

      <Notice text={error} />
      <Notice text={note} kind="ok" />

      <div className="panel">
        <div className="panel-head">
          <h2>Where the money goes</h2>
          <span className="spacer" />
          <span className="faint">A cup with none of its own shows the platform default.</span>
        </div>

        {channels.length === 0 ? (
          <div className="empty">
            No account has been named. Until one is, a captain reaching checkout is told the cup has
            not said where to send the money.
          </div>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Cup</th>
                  <th>Kind</th>
                  <th>Label</th>
                  <th>Number or account</th>
                  <th>State</th>
                  {may ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.id}>
                    <td>{c.tournamentName ?? <span className="faint">Every cup</span>}</td>
                    <td>{c.kind}</td>
                    <td style={{ fontWeight: 600 }}>{c.label}</td>
                    <td>{c.value}</td>
                    <td>
                      <span className={`chip ${c.active ? 'good' : 'warn'}`}>
                        {c.active ? 'live' : 'off'}
                      </span>
                    </td>
                    {may ? (
                      <td className="num">
                        <span className="row" style={{ justifyContent: 'flex-end' }}>
                          <button
                            className="small"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () =>
                                  savePaymentChannel({
                                    id: c.id,
                                    tournamentId: c.tournamentId,
                                    kind: c.kind,
                                    label: c.label,
                                    value: c.value,
                                    instructions: c.instructions,
                                    active: !c.active,
                                    sort: c.sort,
                                  }),
                                c.active ? `${c.label} switched off.` : `${c.label} is live.`,
                              )
                            }
                          >
                            {c.active ? 'Switch off' : 'Switch on'}
                          </button>
                          <button className="small" disabled={busy} onClick={() => startEdit(c)}>
                            Change
                          </button>
                          <button
                            className="small danger"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                const res = await deletePaymentChannel(c.id);
                                if (res.ok && editing === c.id) clearEdit();
                                return res;
                              }, `${c.label} removed.`)
                            }
                          >
                            Remove
                          </button>
                        </span>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {may ? (
          <div className="row" style={{ marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
            <select value={kind} onChange={(e) => setKind(e.target.value as PaymentChannelKind)}>
              <option value="instapay">InstaPay</option>
              <option value="bank">Bank transfer</option>
              <option value="wallet">Mobile wallet</option>
              <option value="contact">Call to arrange</option>
            </select>
            <select value={forCup} onChange={(e) => setForCup(e.target.value)}>
              <option value="">Every cup</option>
              {cups.map((c) => (
                <option key={c.tournamentId} value={c.tournamentId}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label — X League, an e-wallet"
              style={{ minWidth: 220 }}
            />
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Number, address or account"
              style={{ minWidth: 220 }}
            />
            <input
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Anything the captain needs to know (optional)"
              style={{ minWidth: 260 }}
            />
            <button
              className="primary"
              disabled={busy || label.trim().length < 2 || value.trim().length < 2}
              onClick={() =>
                void run(async () => {
                  // Editing keeps the row's id, so a correction lands on the
                  // account captains are already being shown rather than adding
                  // a second one beside it and leaving both live.
                  //
                  // `active` and `sort` are carried across deliberately. The
                  // server writes `coalesce(p_active, true)`, so an edit that
                  // left them out would switch a disabled account on — which is
                  // exactly what somebody correcting a placeholder is not asking
                  // for, and they would find out by a captain being shown it.
                  const current = editing ? channels.find((c) => c.id === editing) : undefined;
                  const res = await savePaymentChannel({
                    id: editing,
                    tournamentId: forCup || null,
                    kind,
                    label: label.trim(),
                    value: value.trim(),
                    instructions: instructions.trim() || null,
                    active: current?.active ?? true,
                    sort: current?.sort ?? 0,
                  });
                  if (res.ok) clearEdit();
                  return res;
                }, editing ? 'Account changed.' : 'Account added.')
              }
            >
              {editing ? 'Save the change' : 'Add account'}
            </button>
            {editing ? (
              <button className="small" disabled={busy} onClick={clearEdit}>
                Cancel
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Promo codes</h2>
          <span className="spacer" />
          <span className="faint">A captain types the code at checkout.</span>
        </div>

        {minted ? (
          <Notice text={`Code ${minted} — send this to the captain.`} kind="ok" />
        ) : null}

        {codes.length === 0 ? (
          <div className="empty">No codes have been minted.</div>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Worth</th>
                  <th>Cup</th>
                  <th className="num">Used</th>
                  <th>State</th>
                  <th>Note</th>
                  {may ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>{c.code}</td>
                    <td>
                      {c.kind === 'free'
                        ? 'Free entry'
                        : c.kind === 'amount'
                          ? `${c.amountEgp} EGP off`
                          : `${c.percent}% off`}
                    </td>
                    <td>{c.tournamentName ?? <span className="faint">Any cup</span>}</td>
                    <td className="num">
                      {c.usedCount} / {c.maxUses}
                    </td>
                    <td>
                      <span
                        className={`chip ${
                          !c.active ? 'warn' : c.usedCount >= c.maxUses ? '' : 'good'
                        }`}
                      >
                        {!c.active ? 'off' : c.usedCount >= c.maxUses ? 'spent' : 'live'}
                      </span>
                    </td>
                    <td className="faint">{c.note ?? ''}</td>
                    {may ? (
                      <td className="num">
                        <button
                          className="small"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => setPromoActive(c.id, !c.active),
                              c.active ? `${c.code} switched off.` : `${c.code} is live again.`,
                            )
                          }
                        >
                          {c.active ? 'Switch off' : 'Switch on'}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {may ? (
          <div className="row" style={{ marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
            <select value={promoKind} onChange={(e) => setPromoKind(e.target.value as PromoKind)}>
              <option value="percent">Percentage off</option>
              <option value="amount">Amount off</option>
              <option value="free">Free entry</option>
            </select>
            {promoKind === 'percent' ? (
              <input
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                placeholder="%"
                style={{ width: 90 }}
              />
            ) : null}
            {promoKind === 'amount' ? (
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="EGP"
                style={{ width: 110 }}
              />
            ) : null}
            <select value={promoCup} onChange={(e) => setPromoCup(e.target.value)}>
              <option value="">Any cup</option>
              {cups.map((c) => (
                <option key={c.tournamentId} value={c.tournamentId}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              value={uses}
              onChange={(e) => setUses(e.target.value)}
              placeholder="Uses"
              style={{ width: 90 }}
            />
            <input
              value={promoNote}
              onChange={(e) => setPromoNote(e.target.value)}
              placeholder="Who it is for (optional)"
              style={{ minWidth: 220 }}
            />
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const res = await createPromoCode({
                    kind: promoKind,
                    amountEgp: promoKind === 'amount' ? Number(amount) || null : null,
                    percent: promoKind === 'percent' ? Number(percent) || null : null,
                    tournamentId: promoCup || null,
                    maxUses: Math.max(1, Number(uses) || 1),
                    note: promoNote.trim() || null,
                  });
                  if (res.ok) {
                    setMinted(res.code);
                    setPromoNote('');
                  }
                  return res.ok ? { ok: true } : { ok: false, reason: res.reason };
                }, 'Code minted.')
              }
            >
              Mint a code
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
