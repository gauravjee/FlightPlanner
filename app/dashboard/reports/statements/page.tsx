// app/dashboard/reports/statements/page.tsx — billing B4b (22 Oct; operator: "PDF statement in reports section,
// accessible by students (only their own), admin and accounts; consolidated weekly / monthly / annual + individual").
// Individual: one student's statement for any period (a student sees only their own). Consolidated: one row per
// student (opening, charges, payments / credits, closing) — admin and accounts. PDF download of either.
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import PeriodPicker, { initialPeriod, rangeOf, type PeriodState } from '@/components/billing/PeriodPicker';
import { useFtoSettings, getFtoSetting } from '@/lib/hooks/useFtoSettings';
import { BILLING_REPORT_ROLES } from '@/lib/permissions';
import { formatINR } from '@/lib/billing';
import { downloadStatement, downloadConsolidated, type StatementData, type ConsolidatedData } from '@/lib/billing-pdf';
import { todayIST } from '@/lib/ist';
import { Download } from 'lucide-react';

const fetchJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Failed to load.');
  return body;
};
const drCr = (n: number) => (n === 0 ? formatINR(0) : `${formatINR(Math.abs(n))} ${n < 0 ? 'Dr' : 'Cr'}`);
const KIND_TITLE = { weekly: 'Consolidated weekly statement', monthly: 'Consolidated monthly statement', annual: 'Consolidated annual statement', custom: 'Consolidated statement' } as const;
const btn = 'px-3 py-1.5 rounded-lg text-sm cursor-pointer';
const on = { backgroundImage: 'linear-gradient(135deg, var(--accent-fill), var(--accent-fill-strong))', color: 'var(--on-accent)' };
const off = { backgroundColor: 'var(--surface-muted)', color: 'var(--text-secondary)' };

export default function StatementsPage() {
  useSetHeader({ title: 'Statements', subtitle: 'Statement of account for a student, or all students' });
  const { data: session } = useSession();
  const role = session?.user?.role ?? '';
  const staff = BILLING_REPORT_ROLES.includes(role);
  const { ftoSettings } = useFtoSettings();
  const school = getFtoSetting(ftoSettings, 'billing_legal_name') || getFtoSetting(ftoSettings, 'school_name');
  const [today] = useState(todayIST);
  const [period, setPeriod] = useState<PeriodState>(() => initialPeriod(today));
  const [mode, setMode] = useState<'individual' | 'consolidated'>('individual');
  const [studentId, setStudentId] = useState('');
  const { from, to } = rangeOf(period);

  const { data: accounts } = useSWR(staff ? '/api/billing/accounts' : null, (u: string) => fetchJson<{ accounts: { id: string; name: string; enrollmentId: string }[] }>(u));
  const qs = `from=${from}&to=${to}`;
  const key = !from || !to ? null : staff && mode === 'consolidated' ? `/api/billing/statements?${qs}&all=1`
    : staff ? (studentId ? `/api/billing/statements?${qs}&studentId=${studentId}` : null) : `/api/billing/statements?${qs}`;
  const { data, error, isLoading } = useSWR(key, (u: string) => fetchJson<StatementData & ConsolidatedData>(u));
  const consolidated = staff && mode === 'consolidated';

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={['student', ...BILLING_REPORT_ROLES]}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-5xl mx-auto px-4 py-6">
            <section className="surface-card p-5">
              <div className="flex flex-wrap items-end gap-3 mb-4">
                {staff && (
                  <div className="flex gap-1" role="group" aria-label="Statement type">
                    <button type="button" className={btn} style={mode === 'individual' ? on : off} aria-pressed={mode === 'individual'} onClick={() => setMode('individual')}>Individual</button>
                    <button type="button" className={btn} style={mode === 'consolidated' ? on : off} aria-pressed={mode === 'consolidated'} onClick={() => setMode('consolidated')}>Consolidated</button>
                  </div>
                )}
                {staff && mode === 'individual' && (
                  <label className="text-xs text-tertiary">Student
                    <select value={studentId} onChange={e => setStudentId(e.target.value)} className="surface-inner rounded-lg px-3 py-1.5 text-sm block">
                      <option value="">— Pick a student —</option>
                      {(accounts?.accounts ?? []).map(a => <option key={a.id} value={a.id}>{a.name}{a.enrollmentId ? ` (${a.enrollmentId})` : ''}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <PeriodPicker value={period} onChange={setPeriod} />

              <div className="mt-5">
                {!key ? <p className="text-secondary text-center py-8">{staff ? 'Pick a student.' : 'Pick a period.'}</p>
                  : isLoading ? <p className="text-secondary text-center py-8">Loading statement...</p>
                  : error || !data ? <p className="text-center py-8" style={{ color: 'var(--danger)' }}>{(error as Error)?.message ?? 'Failed to load.'}</p>
                  : consolidated ? (
                    <>
                      <div className="flex justify-end mb-2">
                        <button type="button" className={`${btn} flex items-center gap-1 font-semibold`} style={on}
                          onClick={() => downloadConsolidated(data, school, KIND_TITLE[period.kind])}><Download className="w-4 h-4" /> PDF</button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm" data-testid="consolidated-statement">
                          <thead><tr className="text-left text-xs uppercase text-tertiary">
                            <th className="pb-2 pr-3">Student</th><th className="pb-2 pr-3 text-right">Opening</th><th className="pb-2 pr-3 text-right">Charges</th>
                            <th className="pb-2 pr-3 text-right">Paid / credit</th><th className="pb-2 text-right">Closing</th>
                          </tr></thead>
                          <tbody>
                            {data.rows.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-secondary">No account activity in this period.</td></tr>}
                            {data.rows.map(r => (
                              <tr key={r.enrollmentId + r.name} className="border-t">
                                <td className="py-2 pr-3">{r.name}<span className="block text-xs text-tertiary">{r.enrollmentId}</span></td>
                                <td className="py-2 pr-3 text-right whitespace-nowrap">{drCr(r.opening)}</td>
                                <td className="py-2 pr-3 text-right whitespace-nowrap">{formatINR(r.charges)}</td>
                                <td className="py-2 pr-3 text-right whitespace-nowrap">{formatINR(r.credits)}</td>
                                <td className="py-2 text-right whitespace-nowrap font-semibold">{drCr(r.closing)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot><tr className="border-t font-semibold">
                            <td className="py-2 pr-3">{data.rows.length} student{data.rows.length === 1 ? '' : 's'}</td><td className="py-2 pr-3 text-right">{drCr(data.totals.opening)}</td>
                            <td className="py-2 pr-3 text-right">{formatINR(data.totals.charges)}</td><td className="py-2 pr-3 text-right">{formatINR(data.totals.credits)}</td>
                            <td className="py-2 text-right">{drCr(data.totals.closing)}</td>
                          </tr></tfoot>
                        </table>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <p className="font-semibold">{data.student.name} <span className="text-xs text-tertiary">{data.student.enrollmentId}</span></p>
                        <button type="button" className={`${btn} flex items-center gap-1 font-semibold`} style={on}
                          onClick={() => downloadStatement(data, school)}><Download className="w-4 h-4" /> PDF</button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm" data-testid="individual-statement">
                          <thead><tr className="text-left text-xs uppercase text-tertiary">
                            <th className="pb-2 pr-3">Date</th><th className="pb-2 pr-3">Particulars</th><th className="pb-2 pr-3 text-right">Charges</th>
                            <th className="pb-2 pr-3 text-right">Paid / credit</th><th className="pb-2 text-right">Balance</th>
                          </tr></thead>
                          <tbody>
                            <tr className="border-t"><td className="py-2 pr-3">{data.from}</td><td className="py-2 pr-3">Opening balance</td><td /><td />
                              <td className="py-2 text-right whitespace-nowrap">{drCr(data.opening)}</td></tr>
                            {data.lines.map((l, i) => (
                              <tr key={i} className="border-t">
                                <td className="py-2 pr-3 whitespace-nowrap">{l.entry_date}</td>
                                <td className="py-2 pr-3">{l.description}{l.method ? <span className="block text-xs text-tertiary">{l.method}{l.reference ? ` · ${l.reference}` : ''}</span> : null}</td>
                                <td className="py-2 pr-3 text-right whitespace-nowrap">{Number(l.debit) ? formatINR(Number(l.debit)) : ''}</td>
                                <td className="py-2 pr-3 text-right whitespace-nowrap">{Number(l.credit) ? formatINR(Number(l.credit)) : ''}</td>
                                <td className="py-2 text-right whitespace-nowrap">{drCr(l.balance)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot><tr className="border-t font-semibold">
                            <td className="py-2 pr-3">{data.to}</td><td className="py-2 pr-3">Closing balance</td>
                            <td className="py-2 pr-3 text-right">{formatINR(data.charges)}</td><td className="py-2 pr-3 text-right">{formatINR(data.credits)}</td>
                            <td className="py-2 text-right">{drCr(data.closing)}</td>
                          </tr></tfoot>
                        </table>
                      </div>
                    </>
                  )}
              </div>
              <p className="text-[11px] text-tertiary mt-3">Dr = owed to the school; Cr = money on account. A voided entry stays on its date and is reversed on the day it was voided.</p>
            </section>
          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}
