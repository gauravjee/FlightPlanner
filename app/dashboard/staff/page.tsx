// app/dashboard/staff/page.tsx
// Staff master (B2, 2026-09-24; claude/staff-master-design-2026-09-24.md).
// One row per person: staff ID, what they're linked to (login / instructor
// profile / AME), status. Admin + super admin (STAFF_ROLES) add and edit.
// ID documents show masked here; the edit form fetches the full values on
// request (logged server-side).
'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import StaffFormModal from '@/components/staff/StaffFormModal';
import { STAFF_ROLES, USER_ROLE_OPTIONS } from '@/lib/permissions';
import { hasLeft, type StaffMember } from '@/lib/staff-id';
import { Plus } from 'lucide-react';

type Filter = 'active' | 'left' | 'all';

async function fetchStaff(url: string): Promise<StaffMember[]> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Failed to load staff.');
  return body.staff;
}

const roleLabel = (role: string) => (USER_ROLE_OPTIONS.find(r => r.value === role)?.label ?? role).replace(/^\P{L}+/u, '');
const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default function StaffPage() {
  useSetHeader({ title: 'Staff', subtitle: 'Staff records and staff IDs' });
  const { data: staff, error, isLoading, mutate } = useSWR('/api/staff', fetchStaff);
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<StaffMember | 'new' | null>(null);
  const [nowMs] = useState(() => Date.now()); // fixed at load (no clock reads in render)

  const rows = useMemo(() => {
    const now = new Date(nowMs);
    const q = search.trim().toLowerCase();
    return (staff ?? []).filter(s => {
      const left = hasLeft(s.lastWorkingDate, now);
      if (filter === 'active' && left) return false;
      if (filter === 'left' && !left) return false;
      return !q || s.name.toLowerCase().includes(q) || s.staffId.toLowerCase().includes(q);
    });
  }, [staff, filter, search, nowMs]);

  const badge = 'inline-block text-xs font-semibold px-2 py-0.5 rounded-full mr-1 whitespace-nowrap';
  const accent = { backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' };

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={STAFF_ROLES}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-7xl mx-auto px-4 py-6">
            <section className="surface-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex rounded-lg overflow-hidden border" role="group" aria-label="Show">
                    {(['active', 'left', 'all'] as Filter[]).map(f => (
                      <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
                        className="px-3 py-1.5 text-sm cursor-pointer capitalize"
                        style={filter === f ? accent : { color: 'var(--text-secondary)' }}>{f}</button>
                    ))}
                  </div>
                  <input type="search" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search name or staff ID"
                    placeholder="Search name or staff ID" className="surface-inner rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
                </div>
                <button type="button" onClick={() => setEditing('new')}
                  className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
                  style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}>
                  <Plus className="w-4 h-4" /> Add staff
                </button>
              </div>

              {isLoading ? <p className="text-secondary text-center py-8">Loading...</p>
                : error ? <p className="text-center py-8" style={{ color: 'var(--danger)' }}>{(error as Error).message}</p>
                : rows.length === 0 ? <p className="text-secondary text-center py-8">No staff to show.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-tertiary">
                        <th className="pb-3 pr-3">Staff ID</th><th className="pb-3 pr-3">Name</th><th className="pb-3 pr-3">Designation</th>
                        <th className="pb-3 pr-3">Joined</th><th className="pb-3 pr-3">Links</th><th className="pb-3 pr-3">Status</th><th className="pb-3"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(s => {
                        const left = hasLeft(s.lastWorkingDate, new Date(nowMs));
                        return (
                          <tr key={s.id} className="border-t">
                            <td className="py-2.5 pr-3 font-mono whitespace-nowrap">{s.staffId}</td>
                            <td className="py-2.5 pr-3">{s.name}</td>
                            <td className="py-2.5 pr-3 text-secondary">{s.designation || '—'}</td>
                            <td className="py-2.5 pr-3 whitespace-nowrap">{fmt(s.joiningDate)}</td>
                            <td className="py-2.5 pr-3">
                              {s.loginRole && <span className={badge} style={accent}>Login · {roleLabel(s.loginRole)}</span>}
                              {s.instructorId !== null && <span className={badge} style={accent}>Instructor profile</span>}
                              {s.ameId !== null && <span className={badge} style={accent}>AME{s.isSub ? ' (contract)' : ''}</span>}
                              {!s.loginRole && s.instructorId === null && s.ameId === null && <span className="text-tertiary">—</span>}
                            </td>
                            <td className="py-2.5 pr-3">
                              {left ? <span className={badge} style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>Left</span>
                                : s.lastWorkingDate ? <span className={badge} style={{ backgroundColor: 'var(--warning-soft)', color: 'var(--warning-text)' }}>Leaves {fmt(s.lastWorkingDate)}</span>
                                : <span className={badge} style={{ backgroundColor: 'var(--success-soft)', color: 'var(--success)' }}>Active</span>}
                            </td>
                            <td className="py-2.5">
                              <button type="button" onClick={() => setEditing(s)} className="text-sm font-semibold cursor-pointer" style={{ color: 'var(--accent)' }}
                                aria-label={`Edit ${s.name}`}>Edit</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </main>
        {editing && (
          <StaffFormModal member={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); mutate(); }} />
        )}
      </RoleGate>
    </ProtectedRoute>
  );
}
