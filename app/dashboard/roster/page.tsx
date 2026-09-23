// app/dashboard/roster/page.tsx
// Instructor duty roster (2026-09-23; claude/duty-roster-design-2026-09-23.md).
//  - Weekly pattern: one shift per day per instructor, repeats every week.
//  - Monthly calendar: who is on duty each day; click a day to set a one-off
//    change (different hours, or a day off) for one instructor.
//  - Bookings that fall outside the roster, so staff can move them —
//    changing a roster never cancels anything by itself.
// Everyone in ROSTER_VIEW_ROLES sees it; ROSTER_EDIT_ROLES can change it.
// All hours come from lib/roster.ts — the same rule bookings will use.
'use client';

import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { useInstructors } from '@/lib/hooks/useInstructors';
import { useScheduledFlights } from '@/lib/hooks/useScheduledFlights';
import { useAvailability } from '@/lib/hooks/useAvailability';
import { useFtoSettings } from '@/lib/hooks/useFtoSettings';
import { useRoster, saveWeeklyRoster, setRosterException, removeRosterException } from '@/lib/hooks/useRoster';
import { dutyWindow, flightFitsDuty, describeWindow, WEEKDAY_NAMES } from '@/lib/roster';
import { leaveCovers, toIST } from '@/lib/leave-window';
import { parseWeeklyOffDays } from '@/lib/store';
import { ROSTER_VIEW_ROLES, ROSTER_EDIT_ROLES } from '@/lib/permissions';
import { ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react';

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
type DayDraft = { on: boolean; start: string; end: string };

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Every date shown in a Monday-first month grid, incl. the edge weeks.
function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = shiftDate(first, -lead);
  const days: string[] = [];
  for (let d = start; days.length < 42; d = shiftDate(d, 1)) days.push(d);
  return days.slice(0, days[35].slice(0, 7) === month ? 42 : 35);
}

const btn = 'px-3 py-1.5 rounded-lg text-sm transition cursor-pointer disabled:opacity-50';
const primary = { backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' };
const muted = { backgroundColor: 'var(--surface-muted)', color: 'var(--text-secondary)' };

export default function RosterPage() {
  const { data: session } = useSession();
  const canEdit = ROSTER_EDIT_ROLES.includes(session?.user?.role ?? '');
  const { instructors } = useInstructors();
  const { scheduledFlights } = useScheduledFlights();
  const { availabilityRecords } = useAvailability();
  const { ftoSettings } = useFtoSettings();
  const { weekly, exceptions, isLoading } = useRoster();

  useSetHeader({ title: 'Duty Roster', subtitle: 'Weekly duty pattern and one-off changes per instructor (IST)' });

  const active = useMemo(() => instructors.filter(i => i.employmentStatus !== 'INACTIVE'), [instructors]);
  const openStart = ftoSettings['time_slot_start'] || '06:00';
  const openEnd = ftoSettings['time_slot_end'] || '20:00';
  // Clock read once per visit (React purity rule — no clock reads during
  // render); reload the page to roll over past midnight.
  const [nowMs] = useState(() => Date.now());
  const today = toIST(new Date(nowMs).toISOString()).date;
  const windowFor = (instructorId: string, date: string) => dutyWindow({
    instructorId, date, weekly, exceptions, openStart, openEnd,
    offDutyDate: instructors.find(i => i.id === instructorId)?.offDutyDate,
  });

  // ---------- Weekly pattern ----------
  const [selectedId, setSelectedId] = useState('');
  const instructorId = selectedId || active[0]?.id || '';
  const [drafts, setDrafts] = useState<Record<string, Record<number, DayDraft>>>({});
  const [weeklyMsg, setWeeklyMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const hasRoster = weekly.some(w => w.instructorId === instructorId);
  const fromRoster = (id: string): Record<number, DayDraft> => {
    const rows = weekly.filter(w => w.instructorId === id);
    const closed = parseWeeklyOffDays(ftoSettings['weekly_off_days']);
    return Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(day => {
      const r = rows.find(x => x.weekday === day);
      // No roster yet: start from the school's opening hours and closed days.
      if (!rows.length) return [day, { on: !closed.includes(day), start: openStart, end: openEnd }];
      return [day, r?.startTime && r.endTime ? { on: true, start: r.startTime, end: r.endTime } : { on: false, start: openStart, end: openEnd }];
    }));
  };
  const draft = drafts[instructorId] ?? fromRoster(instructorId);
  const setDay = (day: number, patch: Partial<DayDraft>) =>
    setDrafts(prev => ({ ...prev, [instructorId]: { ...draft, [day]: { ...draft[day], ...patch } } }));
  const badDay = DAY_ORDER.find(d => draft[d].on && !(draft[d].start && draft[d].end && draft[d].end > draft[d].start));

  const saveWeekly = async () => {
    setSaving(true);
    const err = await saveWeeklyRoster(instructorId, [0, 1, 2, 3, 4, 5, 6].map(d => ({
      weekday: d, startTime: draft[d].on ? draft[d].start : null, endTime: draft[d].on ? draft[d].end : null,
    })));
    setSaving(false);
    if (err) return setWeeklyMsg({ text: err, error: true });
    setDrafts(prev => { const next = { ...prev }; delete next[instructorId]; return next; });
    setWeeklyMsg({ text: 'Weekly roster saved.', error: false });
  };

  // ---------- Monthly calendar ----------
  const [month, setMonth] = useState(today.slice(0, 7));
  const grid = useMemo(() => monthGrid(month), [month]);
  const moveMonth = (n: number) => {
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  const onLeave = (id: string, date: string) => availabilityRecords.some(l =>
    l.status === 'APPROVED' && l.personType === 'instructor' && l.personId === id
    && leaveCovers({ start_date: l.startDate, end_date: l.endDate, start_time: l.startTime, end_time: l.endTime }, date));

  // ---------- One-off change for a day ----------
  const [dayDate, setDayDate] = useState('');
  const [dayInstructor, setDayInstructor] = useState('');
  const [dayForm, setDayForm] = useState<{ off: boolean; start: string; end: string; note: string }>({ off: true, start: openStart, end: openEnd, note: '' });
  const [dayMsg, setDayMsg] = useState<{ text: string; error: boolean } | null>(null);
  const dayId = dayInstructor || active[0]?.id || '';
  const existing = exceptions.find(e => e.instructorId === dayId && e.date === dayDate);
  const openDay = (date: string, id = dayId) => {
    const ex = exceptions.find(e => e.instructorId === id && e.date === date);
    const w = windowFor(id, date).window;
    setDayDate(date);
    setDayInstructor(id);
    setDayMsg(null);
    setDayForm(ex
      ? { off: !ex.startTime, start: ex.startTime ?? openStart, end: ex.endTime ?? openEnd, note: ex.note }
      : { off: false, start: w?.start ?? openStart, end: w?.end ?? openEnd, note: '' });
  };
  const dayBad = !dayForm.off && !(dayForm.start && dayForm.end && dayForm.end > dayForm.start);
  const saveDay = async () => {
    const err = await setRosterException({
      instructorId: dayId, date: dayDate, note: dayForm.note,
      startTime: dayForm.off ? null : dayForm.start, endTime: dayForm.off ? null : dayForm.end,
    });
    setDayMsg(err ? { text: err, error: true } : { text: 'Change saved for this day.', error: false });
  };
  const removeDay = async () => {
    const err = await removeRosterException(dayId, dayDate);
    setDayMsg(err ? { text: err, error: true } : { text: 'Change removed — the weekly pattern applies again.', error: false });
  };

  // ---------- Bookings outside the roster ----------
  const outside = useMemo(() => {
    return scheduledFlights
      .filter(f => f.instructorId && new Date(f.endTime).getTime() > nowMs && (f.status === 'SCHEDULED' || f.status === 'PENDING_APPROVAL'))
      .map(f => ({ f, w: windowFor(String(f.instructorId), toIST(f.startTime).date).window }))
      .filter(({ f, w }) => !flightFitsDuty(w, f.startTime, f.endTime))
      .sort((a, b) => a.f.startTime.localeCompare(b.f.startTime));
    // windowFor reads weekly/exceptions/instructors/settings, all listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduledFlights, weekly, exceptions, instructors, openStart, openEnd, nowMs]);

  const nameOf = (id: string) => instructors.find(i => i.id === id)?.name ?? `Instructor ${id}`;
  const initialsOf = (id: string) => instructors.find(i => i.id === id)?.initials ?? id;

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={ROSTER_VIEW_ROLES}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
            {isLoading ? <p className="text-secondary text-center py-8">Loading...</p> : active.length === 0 ? (
              <p className="text-secondary text-center py-8">No active instructors.</p>
            ) : (<>

            {/* ---------- Weekly pattern ---------- */}
            <section className="surface-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-semibold">Weekly pattern</h2>
                <select value={instructorId} onChange={e => { setSelectedId(e.target.value); setWeeklyMsg(null); }}
                  aria-label="Instructor" className="surface-inner rounded-lg px-3 py-2">
                  {active.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              {!hasRoster && (
                <p className="text-xs text-tertiary mb-3">
                  No roster set yet — {nameOf(instructorId)} is on duty during opening hours ({openStart}–{openEnd}).
                  The days below start from those hours; saving makes this the weekly roster.
                </p>
              )}
              <div className="space-y-2">
                {DAY_ORDER.map(day => (
                  <div key={day} className="flex flex-wrap items-center gap-3">
                    <span className="w-10 text-sm font-medium">{WEEKDAY_NAMES[day]}</span>
                    <label className="flex items-center gap-1.5 text-sm text-secondary w-24">
                      <input type="checkbox" checked={draft[day].on} disabled={!canEdit}
                        onChange={e => setDay(day, { on: e.target.checked })} />
                      On duty
                    </label>
                    {draft[day].on ? (<>
                      <input type="time" step={900} value={draft[day].start} disabled={!canEdit} aria-label={`${WEEKDAY_NAMES[day]} start`}
                        onChange={e => setDay(day, { start: e.target.value })} className="surface-inner rounded-lg px-2 py-1 text-sm" />
                      <span className="text-tertiary">–</span>
                      <input type="time" step={900} value={draft[day].end} disabled={!canEdit} aria-label={`${WEEKDAY_NAMES[day]} end`}
                        onChange={e => setDay(day, { end: e.target.value })} className="surface-inner rounded-lg px-2 py-1 text-sm" />
                    </>) : <span className="text-sm text-tertiary">Off</span>}
                  </div>
                ))}
              </div>
              {badDay !== undefined && (
                <p role="alert" className="text-xs mt-3" style={{ color: 'var(--danger)' }}>
                  {WEEKDAY_NAMES[badDay]}: end time must be after start time.
                </p>
              )}
              {canEdit && (
                <div className="flex items-center gap-3 mt-4">
                  <button onClick={saveWeekly} disabled={saving || badDay !== undefined} className={btn} style={primary}>
                    {saving ? 'Saving…' : 'Save weekly roster'}
                  </button>
                  {drafts[instructorId] && (
                    <button onClick={() => setDrafts(prev => { const n = { ...prev }; delete n[instructorId]; return n; })} className={btn} style={muted}>
                      Undo changes
                    </button>
                  )}
                </div>
              )}
              {weeklyMsg && (
                <p role={weeklyMsg.error ? 'alert' : 'status'} className="text-sm mt-2" style={{ color: weeklyMsg.error ? 'var(--danger)' : 'var(--success)' }}>
                  {weeklyMsg.text}
                </p>
              )}
            </section>

            {/* ---------- Monthly calendar ---------- */}
            <section className="surface-card p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-semibold">
                  {new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
                </h2>
                <div className="flex gap-2">
                  <button onClick={() => moveMonth(-1)} className={btn} style={muted} aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button>
                  <button onClick={() => setMonth(today.slice(0, 7))} className={btn} style={muted}>Today</button>
                  <button onClick={() => moveMonth(1)} className={btn} style={muted} aria-label="Next month"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
              <p className="text-xs text-tertiary mb-3">
                <span style={{ color: 'var(--accent)' }}>Blue</span> = one-off change for that day,{' '}
                <span style={{ color: 'var(--warning-text)' }}>Leave</span> = approved leave.
                {canEdit ? ' Click a day to change it for one instructor.' : ''}
              </p>
              <div className="overflow-x-auto">
                <div className="grid grid-cols-7 gap-1 min-w-[640px]">
                  {DAY_ORDER.map(d => <div key={d} className="text-xs text-tertiary text-center pb-1">{WEEKDAY_NAMES[d]}</div>)}
                  {grid.map(date => {
                    const inMonth = date.slice(0, 7) === month;
                    return (
                      <button key={date} type="button" disabled={!canEdit} onClick={() => openDay(date)}
                        className="surface-inner rounded-lg p-1.5 text-left min-h-[72px] disabled:cursor-default"
                        style={{
                          opacity: inMonth ? 1 : 0.45,
                          outline: date === dayDate ? '2px solid var(--accent)' : date === today ? '1px solid var(--accent)' : undefined,
                        }}
                        aria-label={`${date}${canEdit ? ' — change duty for this day' : ''}`}>
                        <div className="text-xs font-semibold mb-0.5">{Number(date.slice(8))}</div>
                        {active.map(i => {
                          const r = windowFor(i.id, date);
                          const leave = onLeave(i.id, date);
                          const changed = r.source === 'exception' || r.source === 'off-duty-today';
                          return (
                            <div key={i.id} className="text-[11px] leading-tight truncate"
                              style={{ color: leave ? 'var(--warning-text)' : changed ? 'var(--accent)' : r.window ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
                              {i.initials} {leave ? 'Leave' : describeWindow(r.window)}
                            </div>
                          );
                        })}
                      </button>
                    );
                  })}
                </div>
              </div>

              {canEdit && dayDate && (
                <div className="surface-inner rounded-lg p-4 mt-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-semibold">
                      {new Date(`${dayDate}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
                    </h3>
                    <select value={dayId} onChange={e => openDay(dayDate, e.target.value)} aria-label="Instructor for this day" className="surface-inner rounded-lg px-3 py-1.5 text-sm">
                      {active.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                    <span className="text-xs text-tertiary">
                      Now: {describeWindow(windowFor(dayId, dayDate).window)}
                      {existing ? ' (one-off change)' : windowFor(dayId, dayDate).source === 'off-duty-today' ? ' (marked off duty today)' : ''}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1.5 text-sm text-secondary">
                      <input type="checkbox" checked={dayForm.off} onChange={e => setDayForm(p => ({ ...p, off: e.target.checked }))} />
                      Day off
                    </label>
                    {!dayForm.off && (<>
                      <input type="time" step={900} value={dayForm.start} aria-label="Start" onChange={e => setDayForm(p => ({ ...p, start: e.target.value }))} className="surface-inner rounded-lg px-2 py-1 text-sm" />
                      <span className="text-tertiary">–</span>
                      <input type="time" step={900} value={dayForm.end} aria-label="End" onChange={e => setDayForm(p => ({ ...p, end: e.target.value }))} className="surface-inner rounded-lg px-2 py-1 text-sm" />
                    </>)}
                    <input type="text" value={dayForm.note} maxLength={200} placeholder="Note (optional)" aria-label="Note"
                      onChange={e => setDayForm(p => ({ ...p, note: e.target.value }))} className="surface-inner rounded-lg px-3 py-1 text-sm flex-1 min-w-[160px]" />
                  </div>
                  {dayBad && <p role="alert" className="text-xs" style={{ color: 'var(--danger)' }}>End time must be after start time.</p>}
                  <div className="flex flex-wrap gap-2">
                    <button onClick={saveDay} disabled={dayBad} className={btn} style={primary}>Save change for this day</button>
                    {existing && <button onClick={removeDay} className={btn} style={muted}>Remove change</button>}
                    <button onClick={() => setDayDate('')} className={btn} style={muted}>Close</button>
                  </div>
                  {dayMsg && (
                    <p role={dayMsg.error ? 'alert' : 'status'} className="text-sm" style={{ color: dayMsg.error ? 'var(--danger)' : 'var(--success)' }}>{dayMsg.text}</p>
                  )}
                </div>
              )}
            </section>

            {/* ---------- Bookings outside the roster ---------- */}
            <section className="surface-card p-5">
              <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
                <TriangleAlert className="w-4 h-4" style={{ color: outside.length ? 'var(--warning-text)' : 'var(--text-tertiary)' }} />
                Upcoming bookings outside the roster ({outside.length})
              </h2>
              <p className="text-xs text-tertiary mb-3">Changing a roster never cancels a booking — move or cancel these from the Schedule.</p>
              {outside.length === 0 ? (
                <p className="text-sm text-secondary">None — every upcoming booking is inside its instructor&apos;s duty hours.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                        <th className="pb-2">Date</th><th className="pb-2">Time (IST)</th><th className="pb-2">Instructor</th><th className="pb-2">Duty that day</th>
                      </tr>
                    </thead>
                    <tbody className="text-secondary">
                      {outside.map(({ f, w }) => {
                        const s = toIST(f.startTime), e = toIST(f.endTime);
                        return (
                          <tr key={f.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                            <td className="py-2">{s.date}</td>
                            <td className="py-2">{s.time}–{e.time}</td>
                            <td className="py-2">{nameOf(String(f.instructorId))} ({initialsOf(String(f.instructorId))})</td>
                            <td className="py-2">{describeWindow(w)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            </>)}
          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}
