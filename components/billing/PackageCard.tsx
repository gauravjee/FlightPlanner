// components/billing/PackageCard.tsx — billing B2 (21 Oct; claude/billing-design-2026-10-20.md, "B2 plan").
// A student's course package inside the account panel: hours used / left, the payment plan, amount due now.
// Admin / super admin / accounts can assign one, edit the plan and close it; everyone else sees it read-only.

'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { BILLING_CATEGORIES, CATEGORY_LABEL, formatINR, monthlyPlan, round2, type BillingCategory } from '@/lib/billing';
import { todayIST, formatDate } from '@/lib/ist';

type ByCategory = Record<BillingCategory, number>;
export interface PackageInfo {
  id: number; name: string; agreedFee: number; gstRate: number; note: string | null;
  included: ByCategory; used: ByCategory; left: ByCategory;
  instalments: { id: number; due_date: string; amount: number }[];
}
export interface DueInfo { notYetDue: number; due: number; overdue: boolean }
interface CoursePackage { id: number; program_id: number; name: string; fee: number; is_active: boolean }
type PlanRow = { due_date: string; amount: string };

const inputClass = 'surface-inner rounded-lg px-3 py-2 text-sm w-full focus:outline-none';
const primaryBtn = { backgroundImage: 'linear-gradient(135deg, var(--accent-fill), var(--accent-fill-strong))', color: 'var(--on-accent)' };
const fetchPackages = async (url: string): Promise<CoursePackage[]> => {
  const res = await fetch(url);
  return res.ok ? (await res.json()).rows ?? [] : [];
};
const toRows = (plan: { due_date: string; amount: number }[]): PlanRow[] => plan.map(p => ({ due_date: p.due_date, amount: String(p.amount) }));
const sumOf = (rows: PlanRow[]) => round2(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0));

export default function PackageCard({ pkg, due, canPackage, saving, post, gstRate }: {
  pkg: PackageInfo | null; due: DueInfo; canPackage: boolean; saving: boolean; gstRate: number;
  post: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<'assign' | 'plan' | 'close' | null>(null);
  const { data: packages = [] } = useSWR(canPackage && mode === 'assign' ? '/api/admin/config/course-packages?filterColumn=is_active&filterValue=true' : null, fetchPackages);
  const [pick, setPick] = useState('');
  const [fee, setFee] = useState('');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [splitN, setSplitN] = useState('1');
  const today = todayIST();

  const chosen = packages.find(p => String(p.id) === pick);
  // Fee + GST, with GST rounded on the fee the same way the database charges it.
  // B5: today's school-wide GST % (0 without a valid GSTIN), the same rate the database charges the package at.
  const totalFor = (fee: number) => round2(fee + round2((fee * gstRate) / 100));
  const exactTotal = chosen ? totalFor(fee === '' ? Number(chosen.fee) : Number(fee) || 0) : 0;
  const planTotal = mode === 'plan' && pkg ? round2(pkg.instalments.reduce((s, i) => s + i.amount, 0)) : exactTotal;

  const split = (total: number) => setRows(toRows(monthlyPlan(total, Math.max(1, Math.min(60, parseInt(splitN, 10) || 1)), rows[0]?.due_date || today)));
  const plan = () => (planTotal === 0 ? [] : rows.map(r => ({ due_date: r.due_date, amount: r.amount.trim() }))); // a free package has no plan

  const PlanEditor = (
    <div className="mt-2">
      <div className="flex flex-wrap items-end gap-2 mb-2">
        <label className="text-xs text-tertiary">Split into
          <input value={splitN} onChange={e => setSplitN(e.target.value)} inputMode="numeric" className={`${inputClass} w-20`} aria-label="Number of monthly instalments" />
        </label>
        <button type="button" className="px-3 py-2 rounded-lg text-sm surface-inner cursor-pointer" onClick={() => split(planTotal)}>monthly instalments</button>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2 mb-1">
          <input type="date" aria-label={`Instalment ${i + 1} due date`} value={r.due_date} className={inputClass}
            onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, due_date: e.target.value } : x)))} />
          <input inputMode="decimal" aria-label={`Instalment ${i + 1} amount`} value={r.amount} className={inputClass}
            onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
          <button type="button" className="text-xs cursor-pointer" style={{ color: 'var(--danger)' }} aria-label={`Remove instalment ${i + 1}`}
            disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <button type="button" className="text-xs cursor-pointer" style={{ color: 'var(--accent)' }}
        onClick={() => setRows([...rows, { due_date: today, amount: '' }])}>+ Add instalment</button>
      <p className="text-xs mt-1" style={{ color: sumOf(rows) === planTotal ? 'var(--text-tertiary)' : 'var(--danger)' }}>
        Plan adds up to {formatINR(sumOf(rows))} of {formatINR(planTotal)} (fee + GST).
      </p>
    </div>
  );

  if (!pkg) {
    if (!canPackage) return null;
    return (
      <div className="surface-inner rounded-lg p-3 mb-4" data-testid="package-card">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-secondary">No course package.</p>
          <button type="button" className="px-3 py-1.5 rounded-lg text-sm font-semibold cursor-pointer" style={primaryBtn}
            onClick={() => { setMode(mode === 'assign' ? null : 'assign'); setPick(''); setFee(''); setNote(''); setRows([{ due_date: today, amount: '' }]); setSplitN('1'); }}>
            Assign package
          </button>
        </div>
        {mode === 'assign' && (
          <div className="mt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs text-tertiary">Package
                <select value={pick} className={inputClass} onChange={e => {
                  setPick(e.target.value); setFee('');
                  const p = packages.find(x => String(x.id) === e.target.value);
                  if (p) setRows(toRows(monthlyPlan(totalFor(Number(p.fee)), 1, today)));
                }}>
                  <option value="">— Pick a package —</option>
                  {packages.map(p => <option key={p.id} value={p.id}>{p.name} · {formatINR(Number(p.fee))}{gstRate ? ` + ${gstRate}% GST` : ''}</option>)}
                </select>
              </label>
              <label className="text-xs text-tertiary">Agreed fee before GST (blank = list fee)
                <input value={fee} inputMode="decimal" placeholder={chosen ? String(chosen.fee) : ''} className={inputClass}
                  onChange={e => setFee(e.target.value)} onBlur={() => chosen && split(exactTotal)} />
              </label>
              <label className="text-xs text-tertiary sm:col-span-2">Note (staff only, e.g. reason for a discount)
                <input value={note} maxLength={300} className={inputClass} onChange={e => setNote(e.target.value)} />
              </label>
            </div>
            {chosen && PlanEditor}
            <div className="flex gap-2 mt-3">
              <button type="button" disabled={saving || !chosen} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer" style={primaryBtn}
                onClick={async () => { if (await post({ action: 'assignPackage', packageId: Number(pick), agreedFee: fee.trim(), note, plan: plan() })) setMode(null); }}>
                {saving ? 'Saving...' : `Assign and charge ${formatINR(exactTotal)}`}
              </button>
              <button type="button" className="px-4 py-2 rounded-lg text-sm surface-inner cursor-pointer" onClick={() => setMode(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const shown = BILLING_CATEGORIES.filter(c => pkg.included[c] > 0 || pkg.used[c] > 0);
  return (
    <div className="surface-inner rounded-lg p-3 mb-4" data-testid="package-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-tertiary">Course package</p>
          <p className="font-semibold">{pkg.name}</p>
          <p className="text-xs text-tertiary">{formatINR(pkg.agreedFee)} + GST {pkg.gstRate}%{pkg.note ? ` · ${pkg.note}` : ''}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-tertiary">Due now</p>
          <p className="text-lg font-bold" data-testid="due-now" style={{ color: due.due > 0 ? 'var(--danger)' : 'var(--success)' }}>{formatINR(due.due)}</p>
          {due.overdue && <span className="badge badge-danger text-[10px]">Overdue</span>}
          {due.notYetDue > 0 && <p className="text-[11px] text-tertiary">{formatINR(due.notYetDue)} due later</p>}
        </div>
      </div>
      {shown.length > 0 && (
        <table className="w-full text-sm mt-2">
          <thead><tr className="text-left text-xs text-tertiary"><th className="pr-3">Hours</th><th className="pr-3 text-right">Included</th><th className="pr-3 text-right">Used</th><th className="text-right">Left</th></tr></thead>
          <tbody>
            {shown.map(c => (
              <tr key={c}><td className="pr-3">{CATEGORY_LABEL[c]}</td><td className="pr-3 text-right">{pkg.included[c]}</td><td className="pr-3 text-right">{pkg.used[c]}</td>
                <td className="text-right font-semibold">{pkg.left[c]}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-tertiary mt-3 mb-1">Payment plan</p>
      <ul className="text-sm">
        {pkg.instalments.map(i => (
          <li key={i.id} className="flex justify-between gap-2">
            <span>{formatDate(i.due_date)}{i.due_date < today ? <span className="text-xs text-tertiary"> (past)</span> : ''}</span><span>{formatINR(i.amount)}</span>
          </li>
        ))}
      </ul>
      {canPackage && (
        <div className="flex flex-wrap gap-2 mt-3">
          <button type="button" className="px-3 py-1.5 rounded-lg text-sm surface-inner cursor-pointer"
            onClick={() => { setMode(mode === 'plan' ? null : 'plan'); setRows(toRows(pkg.instalments)); setSplitN(String(pkg.instalments.length)); }}>Edit plan</button>
          <button type="button" className="px-3 py-1.5 rounded-lg text-sm surface-inner cursor-pointer" style={{ color: 'var(--danger)' }}
            onClick={() => setMode(mode === 'close' ? null : 'close')}>Close package</button>
        </div>
      )}
      {mode === 'plan' && (
        <div className="mt-2">
          {PlanEditor}
          <div className="flex gap-2 mt-2">
            <button type="button" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer" style={primaryBtn}
              onClick={async () => { if (await post({ action: 'editPlan', plan: plan() })) setMode(null); }}>{saving ? 'Saving...' : 'Save plan'}</button>
            <button type="button" className="px-4 py-2 rounded-lg text-sm surface-inner cursor-pointer" onClick={() => setMode(null)}>Cancel</button>
          </div>
        </div>
      )}
      {mode === 'close' && (
        <div className="mt-2 text-sm">
          <p className="text-secondary mb-2">Close this package? Its unused hours stop being used for flights. Money isn&apos;t changed: give any refund or credit as an adjustment.</p>
          <div className="flex gap-2">
            <button type="button" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer" style={{ backgroundColor: 'var(--danger)', color: '#fff' }}
              onClick={async () => { if (await post({ action: 'closePackage' })) setMode(null); }}>Close package</button>
            <button type="button" className="px-4 py-2 rounded-lg text-sm surface-inner cursor-pointer" onClick={() => setMode(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
