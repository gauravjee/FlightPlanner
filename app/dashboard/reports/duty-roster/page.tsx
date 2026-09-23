// app/dashboard/reports/duty-roster/page.tsx
// Weekly Duty Roster report (2026-09-23; operator request). One week,
// Mon–Sun: each active instructor's duty hours (lib/roster.ts), leave,
// one-off changes, school-closed days, and hours already booked — plus a
// PDF download of the same table (lib/pdf.ts generateWeeklyDutyRoster).
// The table is built once by lib/duty-roster-report.ts for both.
// Visible to ROSTER_VIEW_ROLES (same people who can see the roster).
'use client';

import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { useInstructors } from '@/lib/hooks/useInstructors';
import { useScheduledFlights } from '@/lib/hooks/useScheduledFlights';
import { useAvailability } from '@/lib/hooks/useAvailability';
import { useFtoSettings, getFtoSetting } from '@/lib/hooks/useFtoSettings';
import { useHolidays } from '@/lib/hooks/useHolidays';
import { useRoster } from '@/lib/hooks/useRoster';
import { buildRosterReport, mondayOf, shiftDate, dayLabel, formatHours } from '@/lib/duty-roster-report';
import { getSchedulingBlockReason, parseWeeklyOffDays, parsePartialWeeklyOffRule } from '@/lib/store';
import { toIST } from '@/lib/leave-window';
import { generateWeeklyDutyRoster } from '@/lib/pdf';
import { ROSTER_VIEW_ROLES } from '@/lib/permissions';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';

const btn = 'px-3 py-1.5 rounded-lg text-sm transition cursor-pointer';
const muted = { backgroundColor: 'var(--surface-muted)', color: 'var(--text-secondary)' };
const KIND_COLOR = { duty: 'var(--text-primary)', off: 'var(--text-tertiary)', leave: 'var(--warning-text)', closed: 'var(--text-tertiary)' };

export default function DutyRosterReportPage() {
  const { data: session } = useSession();
  const { instructors } = useInstructors();
  const { scheduledFlights } = useScheduledFlights();
  const { availabilityRecords } = useAvailability();
  const { ftoSettings } = useFtoSettings();
  const { holidays } = useHolidays();
  const { weekly, exceptions, isLoading } = useRoster();

  useSetHeader({ title: 'Weekly Duty Roster', subtitle: 'Instructor duty hours, leave and bookings for one week (IST)' });

  // Clock read once per visit (React purity rule).
  const [thisMonday] = useState(() => mondayOf(toIST(new Date().toISOString()).date));
  const [monday, setMonday] = useState(thisMonday);

  const report = useMemo(() => {
    const weeklyOff = parseWeeklyOffDays(ftoSettings['weekly_off_days']);
    const partial = parsePartialWeeklyOffRule(ftoSettings['partial_weekly_off_days']);
    return buildRosterReport({
      monday,
      instructors: instructors.filter(i => i.employmentStatus !== 'INACTIVE'),
      weekly, exceptions,
      leaves: availabilityRecords
        .filter(l => l.status === 'APPROVED' && l.personType === 'instructor')
        .map(l => ({ personId: l.personId, start_date: l.startDate, end_date: l.endDate, start_time: l.startTime, end_time: l.endTime })),
      flights: scheduledFlights,
      openStart: ftoSettings['time_slot_start'], openEnd: ftoSettings['time_slot_end'],
      closedReason: date => getSchedulingBlockReason(date, holidays, weeklyOff, partial)?.label ?? null,
    });
  }, [monday, instructors, weekly, exceptions, availabilityRecords, scheduledFlights, ftoSettings, holidays]);

  const downloadPdf = () => {
    const now = new Date();
    generateWeeklyDutyRoster({
      ...report,
      ftoName: getFtoSetting(ftoSettings, 'school_name'),
      generatedBy: session?.user?.name || session?.user?.email || undefined,
      generatedAt: `${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })} ${toIST(now.toISOString()).time} IST`,
    });
  };

  const sunday = shiftDate(monday, 6);

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={ROSTER_VIEW_ROLES}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setMonday(shiftDate(monday, -7))} className={btn} style={muted} aria-label="Previous week"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => setMonday(thisMonday)} className={btn} style={muted}>This week</button>
                <button onClick={() => setMonday(shiftDate(monday, 7))} className={btn} style={muted} aria-label="Next week"><ChevronRight className="w-4 h-4" /></button>
                <h2 className="text-base font-semibold ml-2">{dayLabel(monday)} – {dayLabel(sunday)} {sunday.slice(0, 4)}</h2>
              </div>
              <button onClick={downloadPdf} disabled={isLoading} className={`${btn} font-semibold flex items-center gap-1.5 disabled:opacity-50`}
                style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}>
                <Download className="w-4 h-4" /> Download PDF
              </button>
            </div>

            <div className="surface-card p-4">
              {isLoading ? <p className="text-secondary text-center py-8">Loading...</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead>
                      <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                        <th className="pb-2 pr-2">Instructor</th>
                        {report.days.map(d => (
                          <th key={d.date} className="pb-2 pr-2" title={d.closed ?? undefined}>
                            {dayLabel(d.date)}{d.closed && <span className="block text-[11px] font-normal">Closed</span>}
                          </th>
                        ))}
                        <th className="pb-2 pr-2">Rostered</th>
                        <th className="pb-2">Booked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.length === 0 ? (
                        <tr><td colSpan={10} className="py-6 text-center text-secondary">No active instructors.</td></tr>
                      ) : report.rows.map(r => (
                        <tr key={`${r.name}-${r.initials}`} className="border-b align-top" style={{ borderColor: 'var(--border)' }}>
                          <td className="py-2 pr-2 font-medium">{r.name} <span className="text-tertiary">({r.initials})</span></td>
                          {r.cells.map((c, i) => (
                            <td key={i} className="py-2 pr-2 text-xs"
                              style={{ color: c.changed ? 'var(--accent)' : KIND_COLOR[c.kind], backgroundColor: c.kind === 'closed' ? 'var(--surface-muted)' : undefined }}>
                              {c.text}
                            </td>
                          ))}
                          <td className="py-2 pr-2">{formatHours(r.rosteredHours)}</td>
                          <td className="py-2">{formatHours(r.bookedHours)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="text-xs text-tertiary space-y-1">
              <p>Key: hours = on duty (IST) · Off = rostered off · <span style={{ color: 'var(--warning-text)' }}>Leave</span> = approved leave · Closed = school closed · <span style={{ color: 'var(--accent)' }}>*</span> = one-off change · &quot;booked&quot; = booked + flown hours that day (cancelled excluded).</p>
              {report.days.some(d => d.closed) && (
                <p>Closed: {report.days.filter(d => d.closed).map(d => `${dayLabel(d.date)} — ${d.closed}`).join('; ')}</p>
              )}
              {report.notes.map(n => <p key={n}>* {n}</p>)}
            </div>
          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}
