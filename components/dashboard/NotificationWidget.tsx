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
import { useFlightStore } from '@/lib/store';

interface Alert {
  id: string;
  level: 'critical' | 'warning';
  message: string;
}

export default function NotificationWidget() {
  const {
    students, loadStudents,
    maintenanceRecords, loadMaintenanceRecords, loadingMaintenance,
    aircraft, loadAircraft,
  } = useFlightStore();

  // Defensive loads — mirrors the pattern used elsewhere (e.g.
  // MaintenanceForm) for widgets that render before their page's own
  // effects have necessarily run yet.
  useEffect(() => {
    if (students.length === 0) loadStudents();
    if (maintenanceRecords.length === 0) loadMaintenanceRecords();
    if (aircraft.length === 0) loadAircraft();
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
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">🔔 Recent Alerts</h2>
      <div className="space-y-2">
        {alerts.slice(0, 8).map(a => (
          <div key={a.id} className={`bg-slate-900/50 rounded-lg p-3 text-xs border-l-2 ${a.level === 'critical' ? 'border-red-500' : 'border-yellow-500'}`}>
            <p className={`font-medium ${a.level === 'critical' ? 'text-red-400' : 'text-yellow-400'}`}>
              {a.level === 'critical' ? '🔴' : '🟡'} {a.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
