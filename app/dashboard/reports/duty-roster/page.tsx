// app/dashboard/reports/duty-roster/page.tsx
// Duty Roster report (2026-09-23; operator requests). Period: Weekly
// (Mon–Sun, instructors down / days across), Monthly (pick month + year) or
// Custom (two dates, at most 90 days counting both ends) — the last two show
// one row per date and one column per instructor. Instructor selection with
// "All instructors" by default. Each cell: duty hours (lib/roster.ts), leave,
// one-off changes, school-closed days and hours already booked. PDF download
// of the same table (lib/pdf.ts generateDutyRoster); lib/duty-roster-
// report.ts builds the table once for both. Visible to ROSTER_VIEW_ROLES.
// Detailed / Summary switch (2026-09-23): Summary = one row per instructor
// with day counts, hours and flying-limit use (no colour coding).
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
import {
  buildRosterReport, mondayOf, shiftDate, dayLabel, formatHours, daysInclusive, MAX_REPORT_DAYS, type RosterCell,
  flyingLimitUse, summaryTotals,
} from '@/lib/duty-roster-report';
import { effectiveDailyLimit } from '@/lib/instructor-status';
import { getSchedulingBlockReason, parseWeeklyOffDays, parsePartialWeeklyOffRule } from '@/lib/store';
import { toIST } from '@/lib/leave-window';
import { generateDutyRoster } from '@/lib/pdf';
import { ROSTER_VIEW_ROLES } from '@/lib/permissions';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';

type Period = 'weekly' | 'monthly' | 'custom';
type View = 'detailed' | 'summary';
const pct = (v: number | null) => (v === null ? '—' : `${v}%`);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const btn = 'px-3 py-1.5 rounded-lg text-sm transition cursor-pointer';
const muted = { backgroundColor: 'var(--surface-muted)', color: 'var(--text-secondary)' };
const active = { backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' };
const KIND_COLOR = { duty: 'var(--text-primary)', off: 'var(--text-tertiary)', leave: 'var(--warning-text)', closed: 'var(--text-tertiary)' };
const cellStyle = (c: RosterCell) => ({
  color: c.changed ? 'var(--accent)' : KIND_COLOR[c.kind],
  backgroundColor: c.kind === 'closed' ? 'var(--surface-muted)' : undefined,
});
const lastDayOfMonth = (year: number, month0: number) => new Date(Date.UTC(year, month0 + 1, 0)).toISOString().slice(0, 10);

export default function DutyRosterReportPage() {
  const { data: session } = useSession();
  const { instructors } = useInstructors();
  const { scheduledFlights } = useScheduledFlights();
  const { availabilityRecords } = useAvailability();
  const { ftoSettings } = useFtoSettings();
  const { holidays } = useHolidays();
  const { weekly, exceptions, isLoading } = useRoster();

  useSetHeader({ title: 'Duty Roster Report', subtitle: 'Instructor duty hours, leave and bookings (IST)' });

  // Clock read once per visit (React purity rule).
  const [today] = useState(() => toIST(new Date().toISOString()).date);
  const thisMonday = mondayOf(today);
  const [period, setPeriod] = useState<Period>('weekly');
  const [view, setView] = useState<View>('detailed');
  const [monday, setMonday] = useState(thisMonday);
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [month0, setMonth0] = useState(Number(today.slice(5, 7)) - 1);
  const [customFrom, setCustomFrom] = useState(`${today.slice(0, 8)}01`);
  const [customTo, setCustomTo] = useState(today);
  const [picked, setPicked] = useState<string[] | null>(null); // null = all instructors

  // ----- Period -----
  const monthStart = `${year}-${String(month0 + 1).padStart(2, '0')}-01`;
  const [from, to] = period === 'weekly' ? [monday, shiftDate(monday, 6)]
    : period === 'monthly' ? [monthStart, lastDayOfMonth(year, month0)]
    : [customFrom, customTo];
  const dayCount = daysInclusive(from, to);
  const rangeError = period !== 'custom' ? ''
    : !customFrom || !customTo ? 'Pick both dates.'
    : dayCount < 1 ? 'The "To" date must be on or after the "From" date.'
    : dayCount > MAX_REPORT_DAYS ? `The range can't be more than ${MAX_REPORT_DAYS} days — you picked ${dayCount}.`
    : '';

  // ----- Instructors: active ones, plus Inactive ones whose last working
  // day falls on or after the period's first day (operator rule 2026-09-24).
  // Inactive with no last working day recorded -> not shown. Anyone whose
  // joining date is after the period's last day -> not shown.
  const candidates = useMemo(() => instructors
    .filter(i => !i.joiningDate || i.joiningDate <= to)
    .filter(i => i.employmentStatus !== 'INACTIVE' || (!!i.lastWorkingDate && i.lastWorkingDate >= from))
    .map(i => (i.employmentStatus === 'INACTIVE'
      ? { ...i, name: `${i.name} (last day ${dayLabel(i.lastWorkingDate!)} ${i.lastWorkingDate!.slice(0, 4)})` }
      : { ...i, lastWorkingDate: null })),
  [instructors, from, to]);
  const selected = useMemo(() => (picked === null ? candidates : candidates.filter(i => picked.includes(String(i.id)))), [picked, candidates]);
  const toggle = (id: string) => {
    const current = picked ?? candidates.map(i => String(i.id));
    const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
    // Everyone ticked again = "All instructors" (keeps the PDF heading honest).
    setPicked(candidates.every(i => next.includes(String(i.id))) ? null : next);
  };

  const report = useMemo(() => {
    if (rangeError) return null;
    const weeklyOff = parseWeeklyOffDays(ftoSettings['weekly_off_days']);
    const partial = parsePartialWeeklyOffRule(ftoSettings['partial_weekly_off_days']);
    return buildRosterReport({
      from, to, weekly, exceptions,
      instructors: selected.map(i => ({ ...i, dailyLimit: effectiveDailyLimit(i.maxDailyHours, ftoSettings['instructor_daily_limit_hours']) })),
      leaves: availabilityRecords
        .filter(l => l.status === 'APPROVED' && l.personType === 'instructor')
        .map(l => ({ personId: l.personId, start_date: l.startDate, end_date: l.endDate, start_time: l.startTime, end_time: l.endTime })),
      flights: scheduledFlights,
      openStart: ftoSettings['time_slot_start'], openEnd: ftoSettings['time_slot_end'],
      closedReason: date => getSchedulingBlockReason(date, holidays, weeklyOff, partial)?.label ?? null,
    });
  }, [rangeError, from, to, selected, weekly, exceptions, availabilityRecords, scheduledFlights, ftoSettings, holidays]);

  const periodText = `${dayLabel(from)} ${from.slice(0, 4)} to ${dayLabel(to)} ${to.slice(0, 4)} (IST) · ${dayCount} day${dayCount === 1 ? '' : 's'}`;
  const instructorsLabel = picked === null ? 'All instructors' : selected.map(i => i.name).join(', ') || 'No instructors selected';

  const downloadPdf = () => {
    if (!report) return;
    const now = toIST(new Date().toISOString());
    generateDutyRoster({
      ...report,
      layout: view === 'summary' ? 'summary' : period === 'weekly' ? 'week' : 'days',
      title: `${view === 'summary' ? 'Duty Roster Summary' : period === 'weekly' ? 'Weekly Duty Roster' : 'Duty Roster'}${
        period === 'monthly' ? ` — ${MONTHS[month0]} ${year}` : period === 'custom' ? ' — Custom period' : ''}`,
      periodLabel: `${period === 'weekly' ? 'Weekly' : period === 'monthly' ? 'Monthly' : 'Custom'} · ${periodText}`,
      instructorsLabel,
      ftoName: getFtoSetting(ftoSettings, 'school_name'),
      generatedBy: session?.user?.name || session?.user?.email || undefined,
      generatedAt: `${dayLabel(now.date)} ${now.date.slice(0, 4)} ${now.time} IST`,
    });
  };

  const thisYear = Number(today.slice(0, 4));
  const years = [thisYear - 2, thisYear - 1, thisYear, thisYear + 1];

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={ROSTER_VIEW_ROLES}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">

            {/* ----- Period + download ----- */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg overflow-hidden" role="group" aria-label="Report period">
                {(['weekly', 'monthly', 'custom'] as Period[]).map(p => (
                  <button key={p} onClick={() => setPeriod(p)} aria-pressed={period === p}
                    className="px-3 py-1.5 text-sm cursor-pointer capitalize" style={period === p ? active : muted}>{p}</button>
                ))}
              </div>

              <div className="flex rounded-lg overflow-hidden" role="group" aria-label="Report detail">
                {(['detailed', 'summary'] as View[]).map(v => (
                  <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
                    className="px-3 py-1.5 text-sm cursor-pointer capitalize" style={view === v ? active : muted}>{v}</button>
                ))}
              </div>

              {period === 'weekly' && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setMonday(shiftDate(monday, -7))} className={btn} style={muted} aria-label="Previous week"><ChevronLeft className="w-4 h-4" /></button>
                  <button onClick={() => setMonday(thisMonday)} className={btn} style={muted}>This week</button>
                  <button onClick={() => setMonday(shiftDate(monday, 7))} className={btn} style={muted} aria-label="Next week"><ChevronRight className="w-4 h-4" /></button>
                </div>
              )}
              {period === 'monthly' && (
                <div className="flex items-center gap-2">
                  <select value={month0} onChange={e => setMonth0(Number(e.target.value))} aria-label="Month" className="surface-inner rounded-lg px-3 py-1.5 text-sm">
                    {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                  </select>
                  <select value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Year" className="surface-inner rounded-lg px-3 py-1.5 text-sm">
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              )}
              {period === 'custom' && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <label className="flex items-center gap-1.5">From
                    <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="surface-inner rounded-lg px-2 py-1" />
                  </label>
                  <label className="flex items-center gap-1.5">To
                    <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="surface-inner rounded-lg px-2 py-1" />
                  </label>
                  <span className="text-xs text-tertiary">max {MAX_REPORT_DAYS} days</span>
                </div>
              )}

              <button onClick={downloadPdf} disabled={isLoading || !report || report.rows.length === 0} className={`${btn} ml-auto font-semibold flex items-center gap-1.5 disabled:opacity-50`} style={active}>
                <Download className="w-4 h-4" /> Download PDF
              </button>
            </div>

            {rangeError ? (
              <p role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>⛔ {rangeError}</p>
            ) : (
              <h2 className="text-base font-semibold">{periodText}</h2>
            )}

            {/* ----- Instructors ----- */}
            <fieldset className="surface-inner rounded-lg p-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <legend className="sr-only">Instructors</legend>
              <label className="flex items-center gap-1.5 font-semibold">
                <input type="checkbox" checked={picked === null} onChange={e => setPicked(e.target.checked ? null : [])} />
                All instructors
              </label>
              {candidates.map(i => (
                <label key={i.id} className="flex items-center gap-1.5 text-secondary">
                  <input type="checkbox" checked={picked === null || picked.includes(String(i.id))} onChange={() => toggle(String(i.id))} />
                  {i.name}
                </label>
              ))}
            </fieldset>

            {/* ----- Table ----- */}
            <div className="surface-card p-4">
              {isLoading ? <p className="text-secondary text-center py-8">Loading...</p>
                : !report ? <p className="text-secondary text-center py-8">Fix the dates above to see the report.</p>
                : report.rows.length === 0 ? <p className="text-secondary text-center py-8">No instructors selected.</p>
                : view === 'summary' ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[900px]">
                      <thead>
                        <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                          {['Instructor', 'Daily flying limit', 'Days on duty', 'Rostered days off', 'Approved leave (days)', 'Closed days', 'Roster changes (days)', 'Rostered hours', 'Booked hours', 'Flying-limit use']
                            .map(h => <th key={h} className="pb-2 pr-2 align-bottom">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {report.rows.map(r => (
                          <tr key={`${r.name}-${r.initials}`} className="border-b" style={{ borderColor: 'var(--border)' }}>
                            <td className="py-2 pr-2 font-medium">{r.name} <span className="text-tertiary">({r.initials})</span></td>
                            <td className="py-2 pr-2">{r.dailyLimit === null ? '—' : formatHours(r.dailyLimit)}</td>
                            <td className="py-2 pr-2">{r.dutyDays}</td>
                            <td className="py-2 pr-2">{r.daysOff}</td>
                            <td className="py-2 pr-2">{r.leaveDays}</td>
                            <td className="py-2 pr-2">{r.closedDays}</td>
                            <td className="py-2 pr-2">{r.changedDays}</td>
                            <td className="py-2 pr-2">{formatHours(r.rosteredHours)}</td>
                            <td className="py-2 pr-2">{formatHours(r.bookedHours)}</td>
                            <td className="py-2">{pct(flyingLimitUse(r.bookedHours, (r.dailyLimit ?? 0) * r.dutyDays))}</td>
                          </tr>
                        ))}
                        {(() => {
                          const t = summaryTotals(report.rows);
                          return (
                            <tr className="font-semibold" style={{ backgroundColor: 'var(--surface-muted)' }}>
                              <td className="py-2 pr-2">Total ({report.rows.length} instructor{report.rows.length === 1 ? '' : 's'})</td>
                              <td className="py-2 pr-2">—</td>
                              <td className="py-2 pr-2">{t.dutyDays}</td>
                              <td className="py-2 pr-2">{t.daysOff}</td>
                              <td className="py-2 pr-2">{t.leaveDays}</td>
                              <td className="py-2 pr-2">{t.closedDays}</td>
                              <td className="py-2 pr-2">{t.changedDays}</td>
                              <td className="py-2 pr-2">{formatHours(t.rosteredHours)}</td>
                              <td className="py-2 pr-2">{formatHours(t.bookedHours)}</td>
                              <td className="py-2">{pct(t.use)}</td>
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                ) : period === 'weekly' ? (
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
                        {report.rows.map(r => (
                          <tr key={`${r.name}-${r.initials}`} className="border-b align-top" style={{ borderColor: 'var(--border)' }}>
                            <td className="py-2 pr-2 font-medium">{r.name} <span className="text-tertiary">({r.initials})</span></td>
                            {r.cells.map((c, i) => <td key={i} className="py-2 pr-2 text-xs" style={cellStyle(c)}>{c.text}</td>)}
                            <td className="py-2 pr-2">{formatHours(r.rosteredHours)}</td>
                            <td className="py-2">{formatHours(r.bookedHours)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                          <th className="pb-2 pr-2">Date</th>
                          {report.rows.map(r => <th key={`${r.name}-${r.initials}`} className="pb-2 pr-2">{r.name} ({r.initials})</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {report.days.map((d, i) => (
                          <tr key={d.date} className="border-b" style={{ borderColor: 'var(--border)', backgroundColor: d.closed ? 'var(--surface-muted)' : undefined }}>
                            <td className="py-1.5 pr-2 font-medium whitespace-nowrap" title={d.closed ?? undefined}>{dayLabel(d.date)}</td>
                            {report.rows.map(r => <td key={`${r.name}-${r.initials}`} className="py-1.5 pr-2 text-xs" style={cellStyle(r.cells[i])}>{r.cells[i].text}</td>)}
                          </tr>
                        ))}
                        <tr className="font-semibold" style={{ backgroundColor: 'var(--surface-muted)' }}>
                          <td className="py-2 pr-2">Rostered</td>
                          {report.rows.map(r => <td key={`${r.name}-${r.initials}`} className="py-2 pr-2">{formatHours(r.rosteredHours)}</td>)}
                        </tr>
                        <tr className="font-semibold" style={{ backgroundColor: 'var(--surface-muted)' }}>
                          <td className="py-2 pr-2">Booked</td>
                          {report.rows.map(r => <td key={`${r.name}-${r.initials}`} className="py-2 pr-2">{formatHours(r.bookedHours)}</td>)}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
            </div>

            {report && (
              <div className="text-xs text-tertiary space-y-1">
                {view === 'summary' && (<>
                  <p>Flying-limit use = booked hours ÷ (daily flying limit × days on duty); Total = all booked ÷ all possible. Daily flying limit = lower of the instructor&apos;s own Max Daily Hours and the school ceiling.</p>
                  <p>Days on duty = rostered working days on which the school is open, not counting full-day leave (a part-day leave day still counts). Rostered days off = days the roster has them off (weekly pattern, a day-off change, or &quot;off duty today&quot;). Approved leave = leave applied for and approved on the Availability page; part-day = ½. Roster changes = days whose hours were changed on the Duty Roster calendar.</p>
                </>)}
                {view !== 'summary' && <p>Key: hours = on duty (IST) · Off = rostered off · <span style={{ color: 'var(--warning-text)' }}>Leave</span> = approved leave · Closed = school closed · Not joined / Left = before their joining date / after their last working day · <span style={{ color: 'var(--accent)' }}>*</span> = one-off change · &quot;booked&quot; = booked + flown hours that day, incl. pending requests (cancelled excluded).</p>}
                {report.days.some(d => d.closed) && (
                  <p>Closed: {report.days.filter(d => d.closed).map(d => `${dayLabel(d.date)} — ${d.closed}`).join('; ')}</p>
                )}
                {report.notes.map(n => <p key={n}>* {n}</p>)}
              </div>
            )}
          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}
