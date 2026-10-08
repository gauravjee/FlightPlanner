// app/dashboard/instructors/page.tsx
// Instructor management page - view, add, edit, delete instructors
'use client';
import { notify } from '@/lib/notify';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useInstructors, addInstructor, updateInstructor, removeInstructor } from '@/lib/hooks/useInstructors';
import { useScheduledFlights } from '@/lib/hooks/useScheduledFlights';
import { useAvailability } from '@/lib/hooks/useAvailability';
import { useFtoSettings } from '@/lib/hooks/useFtoSettings';
import { Instructor } from '@/types';
import InstructorCard from '@/components/instructors/InstructorCard';
import InstructorFormModal from '@/components/instructors/InstructorFormModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { INSTRUCTORS_VIEW_ROLES, canWriteModule } from '@/lib/permissions';
import { useMyPermissionOverrides } from '@/lib/useMyPermissionOverrides';
import { computeInstructorStatus, dayHours, effectiveDailyLimit, STATUS_LABELS, type ComputedStatus } from '@/lib/instructor-status';
import { toIST } from '@/lib/leave-window';
import { useRoster } from '@/lib/hooks/useRoster';
import { dutyWindow } from '@/lib/roster';
import { ROSTER_VIEW_ROLES } from '@/lib/permissions';
import { Search, GraduationCap } from 'lucide-react';

export default function InstructorsPage() {
  const { data: session } = useSession();
  const overrides = useMyPermissionOverrides();
  // Only admin/super_admin manage the roster by default (2026-08-17
  // role/tab matrix) — operations/instructor/maintenance can view/manage
  // it too if a super_admin has granted a per-user override.
  const canWrite = canWriteModule(session?.user?.role, overrides, 'instructors');
  const { instructors } = useInstructors();
  const { scheduledFlights } = useScheduledFlights();
  // A role without leave access just gets no records here — status then
  // can't show On leave, but nothing breaks.
  const { availabilityRecords } = useAvailability();
  const { ftoSettings } = useFtoSettings();
  // 2026-09-23 (roster step 3): Off duty follows the duty roster. Roles that
  // can't read it fall back to opening hours + "off duty today".
  const { weekly, exceptions } = useRoster(ROSTER_VIEW_ROLES.includes(session?.user?.role ?? ''));
  const [showForm, setShowForm] = useState(false);
  const [editingInstructor, setEditingInstructor] = useState<Instructor | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ComputedStatus>('ALL');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  // 2026-09-23: Inactive (left/retired) instructors are hidden unless asked for.
  const [showInactive, setShowInactive] = useState(false);
  const activeInstructors = instructors.filter(i => i.employmentStatus !== 'INACTIVE');
  const inactiveCount = instructors.length - activeInstructors.length;

  // 2026-09-23: status is COMPUTED, not the stored label (lib/instructor-
  // status.ts; plan in claude/instructor-status-plan-2026-09-23.md). Re-
  // evaluated every minute so Off duty / On leave flip on time.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const statusById = useMemo(() => {
    const today = toIST(now.toISOString()).date;
    const leaves = availabilityRecords.map(r => ({
      personType: r.personType, personId: r.personId, status: r.status,
      start_date: r.startDate, end_date: r.endDate, start_time: r.startTime ?? null, end_time: r.endTime ?? null,
    }));
    return new Map(instructors.map(i => {
      const limit = effectiveDailyLimit(i.maxDailyHours, ftoSettings['instructor_daily_limit_hours']);
      return [i.id, {
        status: computeInstructorStatus({
          instructorId: i.id, now, flights: scheduledFlights, leaves, limit,
          duty: dutyWindow({
            instructorId: i.id, date: today, weekly, exceptions, offDutyDate: i.offDutyDate,
            openStart: ftoSettings['time_slot_start'], openEnd: ftoSettings['time_slot_end'],
          }).window,
        }),
        todayHours: dayHours(scheduledFlights, i.id, today),
        limit,
        offDutyToday: i.offDutyDate === today,
      }];
    }));
  }, [instructors, scheduledFlights, availabilityRecords, ftoSettings, now, weekly, exceptions]);

  // Filter instructors based on search and status
  const filteredInstructors = (showInactive ? instructors : activeInstructors).filter(i => {
    const matchesSearch = i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          i.licenseNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || statusById.get(i.id)?.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Stats — current (Active) instructors only, by computed status.
  const countOf = (s: ComputedStatus) => activeInstructors.filter(i => statusById.get(i.id)?.status === s).length;
  const STAT_ORDER: { status: ComputedStatus; color: string }[] = [
    { status: 'AVAILABLE', color: 'var(--success)' },
    { status: 'FLYING', color: 'var(--accent)' },
    { status: 'ON_LEAVE', color: 'var(--warning-text)' },
    { status: 'LIMIT_REACHED', color: 'var(--danger)' },
    { status: 'OFF_DUTY', color: 'var(--text-secondary)' },
  ];

  const handleAdd = () => {
    setEditingInstructor(null);
    setShowForm(true);
  };

  const handleEdit = (instructor: Instructor) => {
    setEditingInstructor(instructor);
    setShowForm(true);
  };

  const handleSave = (instructor: Instructor | Omit<Instructor, 'id'>) => {
    if (editingInstructor) {
      updateInstructor(editingInstructor.id, instructor);
    } else {
      // 2026-09-24 (B2 S3a): the server can now refuse (e.g. no staff member picked) — say so.
      addInstructor(instructor as Omit<Instructor, 'id'>).then(err => { if (err) notify('Could not add instructor: ' + err); });
    }
    setShowForm(false);
    setEditingInstructor(null);
  };

  const handleDelete = (id: string) => {
    setDeleteTarget(id);
  };

  useSetHeader({
    title: 'Instructors',
    subtitle: 'Manage flight instructors',
    action: canWrite ? (
      <button
        onClick={handleAdd}
        className="px-4 py-2 rounded-lg transition cursor-pointer font-semibold text-sm flex items-center gap-1.5"
        style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
      >
        <GraduationCap className="w-4 h-4" /> Add Instructor
      </button>
    ) : undefined,
  });

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={INSTRUCTORS_VIEW_ROLES} moduleKey="instructors">
    <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mb-6">
          <div className="surface-inner p-4">
            <p className="text-xs text-tertiary">Total</p>
            <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{activeInstructors.length}</p>
          </div>
          {STAT_ORDER.map(({ status, color }) => (
            <div key={status} className="surface-inner p-4">
              <p className="text-xs text-tertiary">{STATUS_LABELS[status]}</p>
              <p className="text-2xl font-bold mt-1" style={{ color }}>{countOf(status)}</p>
            </div>
          ))}
        </div>

        {/* Search & Filter */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-tertiary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" placeholder="Search by name or license..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full surface-inner rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:border-[var(--accent)]" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'ALL' | ComputedStatus)}
            className="surface-inner rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--accent)]">
            <option value="ALL">All Status</option>
            {STAT_ORDER.map(({ status }) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
          </select>
          {inactiveCount > 0 && (
            <label className="flex items-center gap-2 text-sm text-secondary whitespace-nowrap cursor-pointer">
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
              Show inactive ({inactiveCount})
            </label>
          )}
        </div>

        {/* Instructor Cards */}
        {filteredInstructors.length === 0 ? (
          <div className="text-center py-20">
            <GraduationCap className="w-10 h-10 text-tertiary mx-auto mb-4" />
            <p className="text-secondary text-lg">No instructors found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredInstructors.map(i => {
              const s = statusById.get(i.id);
              return (
                <InstructorCard key={i.id} instructor={i} onEdit={handleEdit} onDelete={handleDelete}
                  computedStatus={s?.status ?? 'AVAILABLE'} todayHours={s?.todayHours ?? 0}
                  effectiveLimit={s?.limit ?? effectiveDailyLimit(i.maxDailyHours, undefined)}
                  offDutyToday={!!s?.offDutyToday} />
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <InstructorFormModal instructor={editingInstructor} onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingInstructor(null); }} />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Remove instructor?"
          message="Remove this instructor?"
          confirmLabel="Remove"
          onConfirm={() => { removeInstructor(deleteTarget); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </main>
    </RoleGate>
    </ProtectedRoute>
  );
}
