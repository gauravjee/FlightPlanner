// app/dashboard/accounts/page.tsx — billing B1 (21 Oct; claude/billing-design-2026-10-20.md).
// Every student's balance; pick one to see the account and record payments. The accounts role lands here.

'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { useUrlSearch } from '@/lib/hooks/useUrlSearch';
import StudentAccountPanel from '@/components/billing/StudentAccountPanel';
import { BILLING_VIEW_ROLES, BILLING_RECORD_ROLES, BILLING_ADMIN_ROLES, BILLING_PACKAGE_ROLES } from '@/lib/permissions';
import { formatINR } from '@/lib/billing';

interface AccountRow {
  id: string; name: string; enrollmentId: string; status: string; stage: string | null; balance: number; creditLimit: number;
  packageName: string | null; dueNow: number; overdue: boolean; // B2
}

async function fetchAccounts(url: string): Promise<AccountRow[]> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Failed to load accounts.');
  return body.accounts;
}

export default function AccountsPage() {
  useSetHeader({ title: 'Accounts', subtitle: 'Student balances, payments and charges' });
  const { data: session } = useSession();
  const role = session?.user?.role ?? '';
  const { data: rows, error, isLoading, mutate } = useSWR('/api/billing/accounts', fetchAccounts);
  const [search, setSearch] = useUrlSearch();
  const [owingOnly, setOwingOnly] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter(r => (!owingOnly || r.balance < 0) && (!overdueOnly || r.overdue)
      && (!q || r.name.toLowerCase().includes(q) || r.enrollmentId.toLowerCase().includes(q)));
  }, [rows, search, owingOnly, overdueOnly]);
  const totalOwed = (rows ?? []).reduce((s, r) => s + (r.balance < 0 ? -r.balance : 0), 0);
  const current = rows?.find(r => r.id === selected);

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={BILLING_VIEW_ROLES}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-5 gap-4">
            <section className="surface-card p-5 lg:col-span-2">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <input type="search" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search name or enrollment ID"
                  placeholder="Search name or enrollment ID" className="surface-inner rounded-lg px-3 py-1.5 text-sm focus:outline-none flex-1 min-w-0" />
                <label className="text-sm text-secondary flex items-center gap-1.5">
                  <input type="checkbox" checked={owingOnly} onChange={e => setOwingOnly(e.target.checked)} /> Owing only
                </label>
                <label className="text-sm text-secondary flex items-center gap-1.5">
                  <input type="checkbox" checked={overdueOnly} onChange={e => setOverdueOnly(e.target.checked)} /> Overdue only
                </label>
              </div>
              <p className="text-xs text-tertiary mb-2">Total owed by students: <span className="font-semibold" style={{ color: 'var(--danger)' }}>{formatINR(totalOwed)}</span></p>
              {isLoading ? <p className="text-secondary text-center py-8">Loading...</p>
                : error ? <p className="text-center py-8" style={{ color: 'var(--danger)' }}>{(error as Error).message}</p>
                : shown.length === 0 ? <p className="text-secondary text-center py-8">No students to show.</p> : (
                <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {shown.map(r => (
                    <li key={r.id}>
                      <button type="button" onClick={() => setSelected(r.id)} aria-pressed={selected === r.id}
                        className="w-full text-left py-2.5 px-2 rounded-lg flex items-center justify-between gap-3 cursor-pointer"
                        style={selected === r.id ? { backgroundColor: 'var(--accent-soft)' } : undefined}>
                        <span className="min-w-0">
                          <span className="block font-medium truncate">{r.name}</span>
                          <span className="block text-xs text-tertiary">{r.enrollmentId}{r.stage ? ` · ${r.stage}` : ''}{r.status && r.status !== 'ACTIVE' ? ` · ${r.status}` : ''}{r.packageName ? ` · ${r.packageName}` : ''}</span>
                        </span>
                        <span className="text-right shrink-0">
                          <span className="block font-semibold" style={{ color: r.balance < 0 ? 'var(--danger)' : 'var(--text-primary)' }}>{formatINR(r.balance)}</span>
                          {r.dueNow > 0 && <span className="block text-[11px]" style={{ color: 'var(--danger)' }}>due now {formatINR(r.dueNow)}{r.overdue ? ' · overdue' : ''}</span>}
                          {r.creditLimit > 0 && <span className="block text-[11px] text-tertiary">credit {formatINR(r.creditLimit)}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="surface-card p-5 lg:col-span-3">
              {current ? (
                <>
                  <h2 className="text-lg font-semibold mb-3">{current.name} <span className="text-sm text-tertiary font-normal">{current.enrollmentId}</span></h2>
                  <StudentAccountPanel key={current.id} studentId={current.id}
                    canRecord={BILLING_RECORD_ROLES.includes(role)} canAdmin={BILLING_ADMIN_ROLES.includes(role)}
                    canPackage={BILLING_PACKAGE_ROLES.includes(role)} onChanged={() => mutate()} />
                </>
              ) : <p className="text-secondary text-center py-12">Pick a student to see their account.</p>}
            </section>
          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}
