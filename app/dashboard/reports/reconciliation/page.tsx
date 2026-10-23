// app/dashboard/reports/reconciliation/page.tsx — billing B4b (22 Oct; claude/billing-design-2026-10-20.md, "B4 plan").
// Every logbook flight in a period beside its charge, with flights not charged and voided charges called out, and
// totals by month / student / aircraft. CSV and PDF (operator, 22 Oct: "Screen + CSV + PDF"). Admin and accounts.
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Papa from 'papaparse';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import PeriodPicker, { initialPeriod, rangeOf, type PeriodState } from '@/components/billing/PeriodPicker';
import { useFtoSettings, getFtoSetting } from '@/lib/hooks/useFtoSettings';
import { BILLING_REPORT_ROLES } from '@/lib/permissions';
import { RECON_LABEL, formatINR, reconTotals, csvSafe } from '@/lib/billing';
import { downloadReconciliation, type ReconRow } from '@/lib/billing-pdf';
import { todayIST } from '@/lib/ist';
import { Download } from 'lucide-react';

const fetchRecon = async (url: string): Promise<{ from: string; to: string; rows: ReconRow[] }> => {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Failed to load.');
  return body;
};
const btn = 'px-3 py-1.5 rounded-lg text-sm cursor-pointer flex items-center gap-1 font-semibold';
const on = { backgroundImage: 'linear-gradient(135deg, var(--accent-fill), var(--accent-fill-strong))', color: 'var(--on-accent)' };
const statusColor = (s: ReconRow['status']) => (s === 'NOT_CHARGED' ? 'var(--danger)' : s === 'NO_STUDENT' || s === 'BEFORE_BILLING' ? 'var(--text-tertiary)' : 'var(--success)');

export default function ReconciliationPage() {
  useSetHeader({ title: 'Billing reconciliation', subtitle: 'Logbook flights beside their charges' });
  const { ftoSettings } = useFtoSettings();
  const school = getFtoSetting(ftoSettings, 'billing_legal_name') || getFtoSetting(ftoSettings, 'school_name');
  const [today] = useState(todayIST);
  const [period, setPeriod] = useState<PeriodState>(() => initialPeriod(today));
  const { from, to } = rangeOf(period);
  const { data, error, isLoading } = useSWR(from && to ? `/api/billing/reconciliation?from=${from}&to=${to}` : null, fetchRecon);

  const rows = data?.rows ?? [];
  const totals = [
    { title: 'Totals by month', rows: reconTotals(rows, i => rows[i].flight_date.slice(0, 7)) },
    { title: 'Totals by student', rows: reconTotals(rows, i => rows[i].student || '(no student)') },
    { title: 'Totals by aircraft', rows: reconTotals(rows, i => rows[i].aircraft) },
  ];
  const notCharged = rows.filter(r => r.status === 'NOT_CHARGED').length;
  const voided = rows.filter(r => r.voidedCharges > 0).length;
  const before = rows.filter(r => r.status === 'BEFORE_BILLING').length;

  const exportCsv = () => {
    const main = Papa.unparse(rows.map(r => ({
      Date: r.flight_date, Student: csvSafe(r.student), Aircraft: csvSafe(r.aircraft), Hours: r.hours, 'From package (h)': r.packageHours,
      'Charged (h)': r.chargedHours, 'Charged (Rs)': r.charged, Status: RECON_LABEL[r.status], 'Voided charges': r.voidedCharges,
    })));
    const parts = totals.map(t => `${t.title}\n${Papa.unparse(t.rows.map(x => ({ Group: csvSafe(x.key), Flights: x.flights, Hours: x.hours, 'From package (h)': x.packageHours, 'Charged (Rs)': x.charged })))}`);
    const blob = new Blob([`Billing reconciliation\n${from} to ${to}\n\n${main}\n\n${parts.join('\n\n')}\n`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Billing_reconciliation_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={BILLING_REPORT_ROLES}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-6xl mx-auto px-4 py-6">
            <section className="surface-card p-5">
              <PeriodPicker value={period} onChange={setPeriod} />
              {isLoading ? <p className="text-secondary text-center py-8">Loading...</p>
                : error || !data ? <p className="text-center py-8" style={{ color: 'var(--danger)' }}>{(error as Error)?.message ?? 'Pick a period.'}</p> : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-4 mb-2">
                      <p className="text-sm">
                        {rows.length} flights ·{' '}
                        <span style={{ color: notCharged ? 'var(--danger)' : 'var(--success)' }} data-testid="not-charged">{notCharged} not charged</span>
                        {' · '}{voided} with a voided charge{before ? ` · ${before} before billing started` : ''}
                      </p>
                      <div className="flex gap-2">
                        <button type="button" className={btn} style={on} disabled={!rows.length} onClick={exportCsv}><Download className="w-4 h-4" /> CSV</button>
                        <button type="button" className={btn} style={on} onClick={() => downloadReconciliation({ from, to, rows, totals }, school)}><Download className="w-4 h-4" /> PDF</button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="reconciliation">
                        <thead><tr className="text-left text-xs uppercase text-tertiary">
                          <th className="pb-2 pr-3">Date</th><th className="pb-2 pr-3">Student</th><th className="pb-2 pr-3">Aircraft</th>
                          <th className="pb-2 pr-3 text-right">Hours</th><th className="pb-2 pr-3 text-right">From package</th>
                          <th className="pb-2 pr-3 text-right">Charged</th><th className="pb-2">Status</th>
                        </tr></thead>
                        <tbody>
                          {rows.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-secondary">No logbook flights in this period.</td></tr>}
                          {rows.map((r, i) => (
                            <tr key={i} className="border-t">
                              <td className="py-2 pr-3 whitespace-nowrap">{r.flight_date}</td><td className="py-2 pr-3">{r.student || '—'}</td>
                              <td className="py-2 pr-3">{r.aircraft}</td><td className="py-2 pr-3 text-right">{r.hours}</td>
                              <td className="py-2 pr-3 text-right">{r.packageHours ? `${r.packageHours} h` : ''}</td>
                              <td className="py-2 pr-3 text-right whitespace-nowrap">{r.charged ? `${formatINR(r.charged)} (${r.chargedHours} h)` : ''}</td>
                              <td className="py-2" style={{ color: statusColor(r.status) }}>
                                {RECON_LABEL[r.status]}{r.voidedCharges ? <span className="block text-xs" style={{ color: 'var(--danger)' }}>{r.voidedCharges} voided charge{r.voidedCharges > 1 ? 's' : ''}</span> : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
                      {totals.map(t => (
                        <div key={t.title} className="surface-inner rounded-lg p-3">
                          <p className="font-semibold text-sm mb-2">{t.title}</p>
                          <table className="w-full text-xs">
                            <thead><tr className="text-left text-tertiary"><th className="pr-2" /><th className="pr-2 text-right">Flights</th><th className="pr-2 text-right">Hours</th><th className="text-right">Charged</th></tr></thead>
                            <tbody>
                              {t.rows.map(x => (
                                <tr key={x.key}><td className="pr-2">{x.key}</td><td className="pr-2 text-right">{x.flights}</td><td className="pr-2 text-right">{x.hours}</td>
                                  <td className="text-right whitespace-nowrap">{formatINR(x.charged)}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              <p className="text-[11px] text-tertiary mt-3">A logbook flight is charged when it is saved; package hours are used first. &ldquo;Not charged&rdquo; = a student flight with no live charge and no package hours (e.g. no rate set, or its charge was voided). &ldquo;Before billing&rdquo; = the same, dated before the billing start date in Admin Setup → Billing.</p>
            </section>
          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}
