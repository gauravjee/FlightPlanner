// app/dashboard/duty-hours/page.tsx
// Lightweight instructor duty-hours visibility (2026-08-31) — NOT a DGCA
// compliance feature. Researched whether DGCA's Flight Duty Time
// Limitations CAR (Section 7, Series J, Part III) applies to FTO
// instructors and found no confirmation that it does — that CAR is
// written for commercial/scheduled air-transport flight crew. Per
// explicit user decision, built anyway as a simple visibility tool: how
// many hours has each instructor flown today and over the last 7 days,
// against their own configured Instructors.maxDailyHours (an existing
// field the app already had, previously unused for anything but display).
// Purely computed client-side from scheduledFlights — no new table, no new
// API route, and no claim of regulatory compliance.
'use client';

import { useEffect, useMemo } from 'react';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { useFlightStore } from '@/lib/store';
import { useInstructors } from '@/lib/hooks/useInstructors';
import { Info } from 'lucide-react';

const VIEW_ROLES = ['admin', 'super_admin', 'operations', 'instructor'];

function localDateStr(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA');
}

export default function DutyHoursPage() {
  const { instructors } = useInstructors();
  const { scheduledFlights, loadScheduledFlights } = useFlightStore();

  useEffect(() => { if (scheduledFlights.length === 0) loadScheduledFlights(); }, [scheduledFlights.length, loadScheduledFlights]);

  useSetHeader({
    title: 'Instructor Duty Hours',
    subtitle: 'Non-regulatory visibility — not a DGCA-mandated report',
  });

  const rows = useMemo(() => {
    const now = new Date();
    const today = now.toLocaleDateString('en-CA');
    const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA');
    const active = scheduledFlights.filter(f => f.status !== 'CANCELLED');
    return instructors.map(instr => {
      const flights = active.filter(f => String(f.instructorId) === String(instr.id));
      const todayHours = flights
        .filter(f => localDateStr(f.startTime) === today)
        .reduce((sum, f) => sum + (f.duration || 0), 0);
      const weekHours = flights
        .filter(f => { const d = localDateStr(f.startTime); return d >= sevenDaysAgo && d <= today; })
        .reduce((sum, f) => sum + (f.duration || 0), 0);
      return { instructor: instr, todayHours, weekHours, overToday: instr.maxDailyHours > 0 && todayHours > instr.maxDailyHours };
    }).sort((a, b) => b.todayHours - a.todayHours);
  }, [instructors, scheduledFlights]);

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={VIEW_ROLES}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
            <div className="surface-inner p-3 flex items-start gap-2 text-xs text-secondary">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                This is a lightweight visibility tool, not a DGCA-mandated Flight Duty Time Limitations report — DGCA&apos;s
                FDTL CAR is written for commercial/scheduled air-transport crew, and no confirmed rule extends it to FTO
                instructors. Hours below are computed from Scheduled/Completed bookings against each instructor&apos;s own
                configured Max Daily Hours (Instructors tab), for the flight line to keep an eye on fatigue.
              </p>
            </div>

            <div className="surface-card p-4">
              {rows.length === 0 ? (
                <p className="text-secondary text-center py-8">No instructors found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                        <th className="pb-3">Instructor</th>
                        <th className="pb-3">Today</th>
                        <th className="pb-3">Max Daily Hours</th>
                        <th className="pb-3">Last 7 Days</th>
                      </tr>
                    </thead>
                    <tbody className="text-secondary">
                      {rows.map(({ instructor, todayHours, weekHours, overToday }) => (
                        <tr key={instructor.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                          <td className="py-3">{instructor.name}</td>
                          <td className="py-3">
                            <span className={overToday ? 'badge badge-danger' : todayHours > 0 ? 'badge badge-accent' : 'badge badge-neutral'}>
                              {todayHours.toFixed(1)}h
                            </span>
                          </td>
                          <td className="py-3 text-tertiary">{instructor.maxDailyHours ? `${instructor.maxDailyHours}h` : '—'}</td>
                          <td className="py-3">{weekHours.toFixed(1)}h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}
