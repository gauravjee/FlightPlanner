// components/dashboard/NotificationWidget.tsx
// Shows current alerts on the dashboard: expiring/expired medicals and
// due/overdue maintenance.
//
// This used to read the `notification_log` table — an append-only audit
// trail written once a day by the /api/cron/check-notifications job every
// time it emails admins. That meant an alert stayed here forever once it
// fired, even after the underlying issue was fixed: completing an overdue
// maintenance record (or renewing a medical) never touched the log rows
// that had already been written, so the dashboard kept showing "OVERDUE"
// for maintenance that was long since done.
//
// Instead, this recomputes the same checks the cron job runs, live, from
// the store data the rest of the dashboard already loads — so an alert
// disappears the instant its condition is no longer true, with no separate
// "resolved"/"acknowledged" bookkeeping needed. The cron job's own
// notification_log writes and admin emails are untouched and still work as
// a real audit trail — this widget just no longer reads that table.
'use client';

import { useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { Bell, CircleAlert } from 'lucide-react';
import { useFlightStore } from '@/lib/store';
import { useStudents } from '@/lib/hooks/useStudents';
import { STUDENT_ROSTER_VIEW_ROLES } from '@/lib/permissions';

interface Alert {
  id: string;
  level: 'critical' | 'warning';
  message: string;
}

export default function NotificationWidget() {
  // 2026-08-29 (E2E testing round): same fix as StudentProgressWidget —
  // this widget also renders for every role with no RoleGate, and
  // GET /api/students 403s for roles outside STUDENT_ROSTER_VIEW_ROLES
  // (e.g. maintenance). Gating the fetch here just stops the wasted
  // request/console error; this widget already degrades gracefully (no
  // alerts shown, no misleading text) when `students` comes back empty, so
  // no further change is needed below.
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canViewStudents = !!role && STUDENT_ROSTER_VIEW_ROLES.includes(role);

  const { students } = useStudents(canViewStudents);
  const {
    maintenanceRecords, loadMaintenanceRecords, loadingMaintenance,
  } = useFlightStore();

  // Defensive load — mirrors the pattern used elsewhere (e.g.
  // MaintenanceForm) for widgets that render before their page's own
  // effects have necessarily run yet.
  // 2026-08-28 (SWR migration, Stages 1 + 3): this used to also
  // defensively load aircraft and students here, purely so
  // loadMaintenanceRecords()'s own aircraftReg join had something to read
  // and so this widget's own student loop had data — this widget itself
  // never used the aircraft list, and students now comes from
  // useStudents()'s own fetch-on-mount above. Nothing left here but
  // maintenance records.
  useEffect(() => {
    if (maintenanceRecords.length === 0) loadMaintenanceRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alerts = useMemo<Alert[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const out: Alert[] = [];

    for (const s of students) {
      if (s.status !== 'ACTIVE' || !s.medicalExpiry) continue;
      const exp = new Date(s.medicalExpiry);
      if (exp < today) {
        out.push({ id: `med-expired-${s.id}`, level: 'critical', message: `${s.name}: Medical EXPIRED (${s.medicalExpiry})` });
      } else if (exp <= thirtyDaysFromNow) {
        const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        out.push({ id: `med-due-${s.id}`, level: 'warning', message: `${s.name}: Medical expiring in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${s.medicalExpiry})` });
      }
    }

    for (const m of maintenanceRecords) {
      // COMPLETED/CANCELLED records never alert — this is exactly the
      // check that was missing before (the old log-based version had no
      // way to "un-fire" an alert once the record moved past this state).
      if (m.status !== 'SCHEDULED' && m.status !== 'IN_PROGRESS') continue;
      const reg = m.aircraftReg || 'Unknown';
      if (m.isOverdue) {
        out.push({ id: `mx-overdue-${m.id}`, level: 'critical', message: `${reg}: ${m.maintenanceType} OVERDUE (was due ${new Date(m.scheduledDate).toLocaleDateString('en-IN')})` });
      } else {
        const due = new Date(m.scheduledDate);
        if (due >= today && due <= sevenDaysFromNow) {
          out.push({ id: `mx-due-${m.id}`, level: 'warning', message: `${reg}: ${m.maintenanceType} due on ${due.toLocaleDateString('en-IN')}` });
        }
      }
    }

    // Critical alerts first; stable order within each tier.
    return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'critical' ? -1 : 1));
  }, [students, maintenanceRecords]);

  if (loadingMaintenance && alerts.length === 0) return null;
  if (alerts.length === 0) return null;

  return (
    <div className="surface-card p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Bell className="w-4 h-4 text-secondary" /> Recent Alerts
      </h2>
      <div className="space-y-2">
        {alerts.slice(0, 8).map(a => (
          <div
            key={a.id}
            className="surface-inner p-3 text-xs"
            style={{ borderLeft: `2px solid ${a.level === 'critical' ? 'var(--danger)' : 'var(--warning)'}` }}
          >
            <p
              className="font-medium flex items-center gap-1.5"
              style={{ color: a.level === 'critical' ? 'var(--danger)' : 'var(--warning-text)' }}
            >
              <CircleAlert className="w-3.5 h-3.5 flex-shrink-0" /> {a.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
