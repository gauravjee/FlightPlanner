// components/billing/StudentAccountPanel.tsx — billing B1 (21 Oct; claude/billing-design-2026-10-20.md).
// One student's account: balance, credit limit, rates and ledger. Used by the Accounts page (staff) and
// My Account (the student, read-only). Every write goes to /api/billing/students/[id], which re-checks the role.

'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { notify } from '@/lib/notify';
import { CATEGORY_LABEL, PAYMENT_METHODS, formatINR, type BillingCategory } from '@/lib/billing';

interface Entry {
  id: number; entry_date: string; kind: string; source: string; description: string; hours: number | null;
  rate: number | null; gst_amount: number; debit: number; credit: number; method: string | null; reference: string | null;
  created_by: string | null; voided_at: string | null; void_reason: string | null;
}
interface Account {
  student: { id: string; name: string; enrollmentId: string };
  balance: number; creditLimit: number; creditNote: string | null;
  rates: { category: BillingCategory; hourlyRate: number; gstRate: number; override: boolean }[];
  entries: Entry[];
}

async function fetchAccount(url: string): Promise<Account> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Failed to load the account.');
  return body;
}

const inputClass = 'surface-inner rounded-lg px-3 py-2 text-sm w-full focus:outline-none';
const primaryBtn = { backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' };
type Form = 'payment' | 'opening' | 'adjustment' | 'credit' | null;

export default function StudentAccountPanel({ studentId, canRecord = false, canAdmin = false, onChanged }: {
  studentId: string; canRecord?: boolean; canAdmin?: boolean; onChanged?: () => void;
}) {
  const url = `/api/billing/students/${studentId}`;
  const { data, error, isLoading, mutate } = useSWR(url, fetchAccount);
  const [form, setForm] = useState<Form>(null);
  const [f, setF] = useState({ amount: '', method: 'CASH', reference: '', date: '', note: '', owes: true, charge: true });
  const [voiding, setVoiding] = useState<{ id: number; reason: string } | null>(null);
  const [rateEdit, setRateEdit] = useState<{ category: BillingCategory; value: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const post = async (payload: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { notify(body.error || 'Could not save.'); return false; }
      await mutate();
      onChanged?.();
      return true;
    } finally {
      setSaving(false);
    }
  };

  const open = (next: Form) => {
    setForm(form === next ? null : next);
    setF({ amount: next === 'credit' ? String(data?.creditLimit ?? '') : '', method: 'CASH', reference: '', date: '', note: next === 'credit' ? data?.creditNote ?? '' : '', owes: true, charge: true });
  };

  const submit = async () => {
    const ok = form === 'credit'
      ? await post({ action: 'credit', creditLimit: f.amount.trim() || '0', note: f.note })
      : await post({ action: form, amount: f.amount.trim(), method: f.method, reference: f.reference, date: f.date || undefined, note: f.note, owes: f.owes, charge: f.charge });
    if (ok) setForm(null);
  };

  if (isLoading) return <p className="text-secondary text-center py-8">Loading account...</p>;
  if (error || !data) return <p className="text-center py-8" style={{ color: 'var(--danger)' }}>{(error as Error)?.message ?? 'Failed to load the account.'}</p>;

  const live = data.entries.filter(e => !e.voided_at);
  const hasOpening = live.some(e => e.kind === 'OPENING');

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="surface-inner rounded-lg p-3">
          <p className="text-xs text-tertiary">Balance</p>
          <p className="text-2xl font-bold" data-testid="account-balance" style={{ color: data.balance < 0 ? 'var(--danger)' : 'var(--success)' }}>{formatINR(data.balance)}</p>
          <p className="text-xs text-tertiary">{data.balance < 0 ? 'owed by the student' : 'on account'}</p>
        </div>
        <div className="surface-inner rounded-lg p-3">
          <p className="text-xs text-tertiary">Credit limit</p>
          <p className="text-2xl font-bold">{formatINR(data.creditLimit)}</p>
          <p className="text-xs text-tertiary truncate" title={data.creditNote ?? ''}>{data.creditNote || 'Allowed below zero before bookings stop'}</p>
        </div>
        <div className="surface-inner rounded-lg p-3">
          <p className="text-xs text-tertiary mb-1">Hourly rates (incl. instructor)</p>
          {data.rates.map(r => (
            <div key={r.category} className="flex items-center justify-between text-sm gap-2">
              <span>{CATEGORY_LABEL[r.category]}{r.override && <span className="badge badge-accent ml-1 text-[10px]">student rate</span>}</span>
              {rateEdit?.category === r.category ? (
                <span className="flex items-center gap-1">
                  <input aria-label={`${CATEGORY_LABEL[r.category]} rate for this student`} value={rateEdit.value} inputMode="decimal"
                    onChange={e => setRateEdit({ ...rateEdit, value: e.target.value })} className="surface-inner rounded px-2 py-0.5 w-24 text-sm" />
                  <button type="button" disabled={saving} className="text-xs font-semibold cursor-pointer" style={{ color: 'var(--accent)' }}
                    onClick={async () => { if (await post({ action: 'rate', category: r.category, hourlyRate: rateEdit.value.trim() })) setRateEdit(null); }}>Save</button>
                  <button type="button" className="text-xs cursor-pointer text-tertiary" onClick={() => setRateEdit(null)}>Cancel</button>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{r.hourlyRate ? `${formatINR(r.hourlyRate)}/h` : 'not set'}</span>
                  {canAdmin && <button type="button" className="text-xs cursor-pointer" style={{ color: 'var(--accent)' }}
                    aria-label={`Set ${CATEGORY_LABEL[r.category]} rate for this student`}
                    onClick={() => setRateEdit({ category: r.category, value: r.override ? String(r.hourlyRate) : '' })}>Edit</button>}
                  {canAdmin && r.override && <button type="button" disabled={saving} className="text-xs cursor-pointer text-tertiary"
                    aria-label={`Use the school ${CATEGORY_LABEL[r.category]} rate`}
                    onClick={() => post({ action: 'rate', category: r.category, hourlyRate: null })}>Reset</button>}
                </span>
              )}
            </div>
          ))}
          {data.rates[0] && <p className="text-[11px] text-tertiary mt-1">+ GST {data.rates[0].gstRate}%</p>}
        </div>
      </div>

      {(canRecord || canAdmin) && (
        <div className="flex flex-wrap gap-2 mb-3">
          {canRecord && <button type="button" className="px-3 py-1.5 rounded-lg text-sm font-semibold cursor-pointer" style={primaryBtn} onClick={() => open('payment')}>Record payment</button>}
          {canRecord && !hasOpening && <button type="button" className="px-3 py-1.5 rounded-lg text-sm surface-inner cursor-pointer" onClick={() => open('opening')}>Opening balance</button>}
          {canRecord && <button type="button" className="px-3 py-1.5 rounded-lg text-sm surface-inner cursor-pointer" onClick={() => open('adjustment')}>Adjustment</button>}
          {canAdmin && <button type="button" className="px-3 py-1.5 rounded-lg text-sm surface-inner cursor-pointer" onClick={() => open('credit')}>Credit limit</button>}
        </div>
      )}

      {form && (
        <div className="surface-inner rounded-lg p-3 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="account-form">
          <label className="text-xs text-tertiary">{form === 'credit' ? 'Credit limit (₹, 0 = none)' : 'Amount (₹)'}
            <input value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} inputMode="decimal" className={inputClass} />
          </label>
          {form === 'payment' && (
            <label className="text-xs text-tertiary">Method
              <select value={f.method} onChange={e => setF({ ...f, method: e.target.value })} className={inputClass}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          )}
          {form === 'payment' && (
            <label className="text-xs text-tertiary">Reference (UTR, cheque no.)
              <input value={f.reference} onChange={e => setF({ ...f, reference: e.target.value })} maxLength={100} className={inputClass} />
            </label>
          )}
          {form === 'opening' && (
            <label className="text-xs text-tertiary">The student
              <select value={f.owes ? 'owes' : 'credit'} onChange={e => setF({ ...f, owes: e.target.value === 'owes' })} className={inputClass}>
                <option value="owes">owes the school this amount</option>
                <option value="credit">has this amount in credit</option>
              </select>
            </label>
          )}
          {form === 'adjustment' && (
            <label className="text-xs text-tertiary">Type
              <select value={f.charge ? 'charge' : 'credit'} onChange={e => setF({ ...f, charge: e.target.value === 'charge' })} className={inputClass}>
                <option value="charge">Extra charge to the student</option>
                <option value="credit">Credit to the student (refund, discount)</option>
              </select>
            </label>
          )}
          {form !== 'credit' && (
            <label className="text-xs text-tertiary">Date (blank = today)
              <input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} className={inputClass} />
            </label>
          )}
          <label className="text-xs text-tertiary sm:col-span-2">{form === 'adjustment' ? 'Reason *' : 'Note'}
            <input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} maxLength={300} className={inputClass} />
          </label>
          <div className="sm:col-span-2 flex gap-2">
            <button type="button" disabled={saving} onClick={submit} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer" style={primaryBtn}>{saving ? 'Saving...' : 'Save'}</button>
            <button type="button" onClick={() => setForm(null)} className="px-4 py-2 rounded-lg text-sm surface-inner cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {data.entries.length === 0 ? <p className="text-secondary text-center py-6">No entries yet.</p> : (
        <div className="overflow-x-auto relative">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-tertiary">
                <th className="pb-2 pr-3">Date</th><th className="pb-2 pr-3">Entry</th>
                <th className="pb-2 pr-3 text-right">Charge</th><th className="pb-2 pr-3 text-right">Paid / credit</th>
                {canAdmin && <th className="pb-2"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {data.entries.map(e => (
                <tr key={e.id} className="border-t align-top" style={e.voided_at ? { opacity: 0.55 } : undefined}>
                  <td className="py-2 pr-3 whitespace-nowrap">{e.entry_date}</td>
                  <td className="py-2 pr-3">
                    <span className={e.voided_at ? 'line-through' : ''}>{e.description}</span>
                    <span className="block text-xs text-tertiary">
                      {e.kind.toLowerCase()}{e.method ? ` · ${e.method}` : ''}{e.reference ? ` · ${e.reference}` : ''}
                      {e.hours != null && e.rate != null ? ` · ${e.hours} h × ${formatINR(Number(e.rate))} + GST ${formatINR(Number(e.gst_amount))}` : ''}
                    </span>
                    {e.voided_at && <span className="block text-xs" style={{ color: 'var(--danger)' }}>Voided: {e.void_reason}</span>}
                    {voiding?.id === e.id && (
                      <span className="flex gap-2 mt-1">
                        <input autoFocus aria-label="Reason for voiding" placeholder="Reason for voiding" value={voiding.reason}
                          onChange={ev => setVoiding({ ...voiding, reason: ev.target.value })} className="surface-inner rounded px-2 py-1 text-xs flex-1" />
                        <button type="button" disabled={saving} className="text-xs font-semibold cursor-pointer" style={{ color: 'var(--danger)' }}
                          onClick={async () => { if (await post({ action: 'void', entryId: e.id, reason: voiding.reason })) setVoiding(null); }}>Void</button>
                        <button type="button" className="text-xs cursor-pointer text-tertiary" onClick={() => setVoiding(null)}>Cancel</button>
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">{Number(e.debit) ? formatINR(Number(e.debit)) : ''}</td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">{Number(e.credit) ? formatINR(Number(e.credit)) : ''}</td>
                  {canAdmin && (
                    <td className="py-2 text-right">
                      {!e.voided_at && voiding?.id !== e.id && (
                        <button type="button" className="text-xs cursor-pointer" style={{ color: 'var(--danger)' }}
                          aria-label={`Void ${e.description}`} onClick={() => setVoiding({ id: e.id, reason: '' })}>Void</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-tertiary mt-3">
        Flights are charged when the logbook entry is saved: logbook flight time × hourly rate + GST. Entries are never deleted; a mistake is voided with a reason.
      </p>
    </div>
  );
}
