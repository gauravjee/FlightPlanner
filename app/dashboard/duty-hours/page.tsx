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

import { useMemo } from 'react';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { useInstructors } from '@/lib/hooks/useInstructors';
import { useScheduledFlights } from '@/lib/hooks/useScheduledFlights';
import { useFtoSettings } from '@/lib/hooks/useFtoSettings';
import { dayHours, effectiveDailyLimit } from '@/lib/instructor-status';
import { toIST } from '@/lib/leave-window';
import { Info } from 'lucide-react';

const VIEW_ROLES = ['admin', 'super_admin', 'operations', 'instructor'];

// 2026-09-23: FTO (IST) calendar date, not the browser's — same as the
// booking limit check, so "Today" matches whatever computer opens this page.
function istDate(iso: string): string {
  return toIST(iso).date;
}

export default function DutyHoursPage() {
  const { instructors } = useInstructors();
  const { scheduledFlights } = useScheduledFlights();
  const { ftoSettings } = useFtoSettings();

  useSetHeader({
    title: 'Instructor Duty Hours',
    subtitle: 'Non-regulatory visibility — not a DGCA-mandated report',
  });

  const rows = useMemo(() => {
    const now = new Date();
    const today = istDate(now.toISOString());
    const sevenDaysAgo = istDate(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString());
    const active = scheduledFlights.filter(f => f.status !== 'CANCELLED');
    // 2026-09-23: current (Active) instructors only.
    return instructors.filter(i => i.employmentStatus !== 'INACTIVE').map(instr => {
      const flights = active.filter(f => String(f.instructorId) === String(instr.id));
      // 2026-09-23: same rule the booking hard block uses (lib/instructor-
      // status.ts) — booked + flown, against the limit that actually applies
      // (lower of own Max Daily Hours and the school ceiling).
      const todayHours = dayHours(scheduledFlights, instr.id, today);
      const limit = effectiveDailyLimit(instr.maxDailyHours, ftoSettings['instructor_daily_limit_hours']);
      const weekHours = flights
        .filter(f => { const d = istDate(f.startTime); return d >= sevenDaysAgo && d <= today; })
        .reduce((sum, f) => sum + (f.duration || 0), 0);
      return { instructor: instr, todayHours, weekHours, limit, atLimit: todayHours >= limit - 1e-9 };
    }).sort((a, b) => b.todayHours - a.todayHours);
  }, [instructors, scheduledFlights, ftoSettings]);

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
                instructors. Today&apos;s hours count every booked and flown flight (cancelled ones don&apos;t), against the limit
                that applies — the lower of the instructor&apos;s own Max Daily Hours and the school-wide ceiling (Admin Setup →
                FTO Settings). That limit is the school&apos;s own rule and is enforced: bookings that would go over it are refused.
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
                        <th className="pb-3">Daily Limit</th>
                        <th className="pb-3">Last 7 Days</th>
                      </tr>
                    </thead>
                    <tbody className="text-secondary">
                      {rows.map(({ instructor, todayHours, weekHours, limit, atLimit }) => (
                        <tr key={instructor.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                          <td className="py-3">{instructor.name}</td>
                          <td className="py-3">
                            <span className={atLimit ? 'badge badge-danger' : todayHours > 0 ? 'badge badge-accent' : 'badge badge-neutral'}>
                              {todayHours.toFixed(1)}h
                            </span>
                          </td>
                          <td className="py-3 text-tertiary">{limit}h</td>
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
