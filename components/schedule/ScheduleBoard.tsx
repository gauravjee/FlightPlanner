// components/schedule/ScheduleBoard.tsx
// Gantt chart schedule board showing all aircraft and their booked flight slots.
//
// Features:
//   - Click to view details, hover for highlight, print schedule, book new slots
//   - IST timezone display (converts UTC from database)
//   - Hour & half‑hour grid lines (dashed for half‑hours, dotted for UTC hours)
//   - Red current time indicator line (only when viewing today)
//   - Alternating row colors for readability
//   - Start time markers on each flight block
//   - Edit & Cancel functionality via the detail modal
//   - Date picker with Prev / Next / Today buttons – shows only one day at a time
//   - Print report with merged blocks, instructor/student lists, and legend
//   - **Exercise short code** displayed on flight blocks (e.g., "CCTS")
//   - Sortie Types legend: DUAL, SOLO, MAINTENANCE with distinct colors
//   - Exercise legend in table format below sortie types with visible codes

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { Calendar, Printer, Plus, Wrench, TriangleAlert, ClipboardList, X, Lock, Eye } from 'lucide-react';
import { useFlightStore, getSchedulingBlockReason, parseWeeklyOffDays, parsePartialWeeklyOffRule } from '@/lib/store';
import { useScheduledFlights, withScheduledFlightNames, checkConflicts, updateScheduledFlight } from '@/lib/hooks/useScheduledFlights';
import { useAircraft } from '@/lib/hooks/useAircraft';
import { useInstructors } from '@/lib/hooks/useInstructors';
import { useStudents } from '@/lib/hooks/useStudents';
import { getLocationDisplay } from '@/lib/location';
import { FlightSlot, ScheduledFlight } from '@/types';
import { SCHEDULE_CREATE_ROLES } from '@/lib/permissions';
import FlightDetailModal from './FlightDetailModal';
import BookingForm from './BookingForm';
import DebriefForm from './DebriefForm';


// ============================================================
// CONSTANTS – Sortie type colors and labels (used for legend)
// ------------------------------------------------------------
// Mapped onto the same design tokens used everywhere else: DUAL (the
// default/most common booking) reads as the brand accent, SOLO as
// success (green — matches the "In progress" status color elsewhere),
// MAINTENANCE as warning (amber). Kept as CSS var references (not
// literal Tailwind color classes) so a theme retune updates these too.
// ============================================================
const SORTIE_COLOR_VARS: Record<string, string> = {
  DUAL: 'var(--accent-strong)',
  SOLO: 'var(--success)',
  MAINTENANCE: 'var(--warning-text)',
};

const SORTIE_LABELS: Record<string, string> = {
  DUAL: 'Dual',
  SOLO: 'Solo',
  MAINTENANCE: 'Maintenance',
};

/**
 * Extract the short code from a full exercise name.
 * Example: "CCTS - Circuits & Landings" → "CCTS"
 *
 * Used to label flight blocks on the Gantt chart from a booked flight's
 * stored exercise string alone (there's no easy join back to the
 * `exercises` table from a flight row). This used to consult a hardcoded
 * EXERCISE_SHORT_CODES map first (removed 2026-08-19, same round the
 * Exercise Codes legend below was switched to the live `exercises` table)
 * — that map was really only ever re-deriving what's already in the
 * stored "CODE - Name" string, since BookingForm has always constructed
 * that value as `${short_code} - ${exercise_name}`. Splitting on " - "
 * here does exactly that, with no separate list to fall out of sync.
 */
const getExerciseShortCode = (fullExercise: string): string => {
  if (!fullExercise) return '';
  const dashIndex = fullExercise.indexOf(' - ');
  if (dashIndex > 0) {
    return fullExercise.substring(0, dashIndex);
  }
  // Fallback: return first 6 characters
  return fullExercise.substring(0, 6);
};

export default function ScheduleBoard() {

  // CONSTANTS – Debrief Form State
  const [showDebriefForm, setShowDebriefForm] = useState(false);     // Toggle debrief modal
  const [debriefFlight, setDebriefFlight] = useState<ScheduledFlight | null>(null); // Flight being checked out

  // ----- UI State (local to this component) -----
  const [showBookingForm, setShowBookingForm] = useState(false);  // Toggle booking modal
  const [successMessage, setSuccessMessage] = useState('');        // Green toast message
  const [errorMessage, setErrorMessage] = useState('');            // Red toast message (past-time / maintenance blocks)
  const [editingFlight, setEditingFlight] = useState<ScheduledFlight | null>(null); // Flight being edited
  // Aircraft/date/time captured from clicking an empty spot on the grid,
  // passed to BookingForm to pre-fill a new booking. null when the form was
  // opened via the "+ Book Slot" button instead (no prefill).
  const [gridClickPrefill, setGridClickPrefill] = useState<{ aircraftId: string; date: string; startTime: string } | null>(null);

  // Drag-and-drop rescheduling: the flight currently being dragged (native
  // HTML5 DnD — no library, this is just a Gantt block dragged within/across
  // rows), and which aircraft row it's currently hovering (for the row
  // highlight). Cleared on drop or dragend either way.
  const [draggingFlight, setDraggingFlight] = useState<ScheduledFlight | null>(null);
  const [dragOverAircraftId, setDragOverAircraftId] = useState<string | null>(null);

  // ----- Date filter (local date in YYYY-MM-DD format) -----
  const todayLocal = new Date().toLocaleDateString('en-CA');       // e.g. "2026-08-03"
  const [selectedDate, setSelectedDate] = useState(todayLocal);    // Currently selected date

  // ----- Global State (from Zustand store) -----
  const store = useFlightStore();

  // Data collections
  const { aircraft } = useAircraft();            // Fleet data
  const { instructors } = useInstructors();      // Instructor list
  const { students } = useStudents();            // Student list

  // ----- Who's allowed to CREATE a brand-new booking (server-side gate is
  // requireScheduleCreateAccess() in lib/api-auth.ts — this mirrors it
  // client-side purely for UX, so the wrong role sees a clear message
  // instead of a raw 403 after filling out the whole form). admin/
  // super_admin/operations always can; an instructor only if their own
  // instructors row has can_self_book set (matched by session email, same
  // as app/dashboard/instructor/page.tsx). Doesn't affect viewing the
  // board, or editing/debriefing/cancelling a flight already assigned to
  // that instructor — see the FlightDetailModal onEdit handler below,
  // which is intentionally NOT gated by this. -----
  const { data: session } = useSession();
  const sessionRole = session?.user?.role;
  const currentInstructor = instructors.find(i => i.email === session?.user?.email);
  const canCreateBooking =
    (!!sessionRole && SCHEDULE_CREATE_ROLES.includes(sessionRole)) ||
    (sessionRole === 'instructor' && !!currentInstructor?.canSelfBook);

  // UI state from store
  const selectedSlot = store.selectedSlot;       // Currently clicked slot for modal
  const hoveredSlot = store.hoveredSlot;         // Currently hovered slot for highlight
  const setSelectedSlot = store.setSelectedSlot; // Open/close detail modal
  const setHoveredSlot = store.setHoveredSlot;   // Track hover state

  // Data loading actions
  // Scheduled flights come from SWR (Stage 5, 2026-09-01) — fetch-on-mount +
  // dedup, no manual load call needed. Names are joined in at render time via
  // withScheduledFlightNames (not baked into the fetcher) because
  // cancelFlight/updateScheduledFlight both do local-splice writes — most
  // notably drag-and-drop reassigning a flight to a different aircraft,
  // which would leave a stale baked-in aircraftReg otherwise.
  const { scheduledFlights: rawScheduledFlights } = useScheduledFlights();
  const scheduledFlights = withScheduledFlightNames(rawScheduledFlights, aircraft, students, instructors);
  const maintenanceRecords = store.maintenanceRecords;      // All maintenance records (for blocking slots)
  const loadMaintenanceRecords = store.loadMaintenanceRecords;
  const ftoSettings = store.ftoSettings;                    // School name / airport code for the printed schedule header
  const loadFTOSettings = store.loadFTOSettings;
  const getFTOSetting = store.getFTOSetting;
  const holidays = store.holidays;                          // FTO-wide blackout dates
  const loadHolidays = store.loadHolidays;
  const exercises = store.exercises;                        // Exercise codes (Admin Setup -> Exercises), for the legend below
  const loadExercises = store.loadExercises;

  // Same "CODE - Name" / short-code tuple shape the legend table and print
  // report were already built around, now sourced from the live exercises
  // table instead of a hardcoded EXERCISE_SHORT_CODES map (removed
  // 2026-08-19) — a new exercise added in Admin Setup -> Exercises shows
  // up here automatically instead of needing a matching code change.
  const exerciseEntries: [string, string][] = exercises.map(
    ex => [`${ex.short_code} - ${ex.exercise_name}`, ex.short_code]
  );

  // FTO-wide weekly recurring off day(s) (Settings -> Time & Scheduling ->
  // "Weekly Off Day(s)"), parsed from the raw comma-separated fto_settings
  // value, plus the partial (occurrence-based) rule from the same section
  // (2026-08-25).
  const weeklyOffDays = parseWeeklyOffDays(ftoSettings['weekly_off_days']);
  const partialWeeklyOffRule = parsePartialWeeklyOffRule(ftoSettings['partial_weekly_off_days']);

  // ----- Load data when component mounts -----
  // Aircraft, Instructors, Students, and now Scheduled Flights come from
  // SWR hooks above (fetch-on-mount + dedup, 2026-08-28/09-01 SWR migration,
  // Stages 1-3 and 5).
  useEffect(() => {
    loadMaintenanceRecords(); // Load maintenance records so we can block slots for aircraft under/scheduled for maintenance
    loadHolidays();           // Load holiday calendar so we can block slots on closed dates
    if (exercises.length === 0) loadExercises(); // Load exercise codes for the legend below
  }, [loadMaintenanceRecords, loadHolidays, exercises.length, loadExercises]);

  // Is the currently viewed date blocked for scheduling — a holiday or the
  // FTO's weekly off day? null if the date is open.
  const dateBlockReason = getSchedulingBlockReason(selectedDate, holidays, weeklyOffDays, partialWeeklyOffRule);

  // Loaded defensively in its own effect (not just relying on the main
  // dashboard having already loaded it) so the Print Schedule sheet below
  // shows the real configured school name/airport even if a user lands
  // directly on this page without visiting the dashboard first. Kept
  // separate from the effect above so it doesn't re-trigger the other
  // (unrelated) data loads once ftoSettings populates.
  useEffect(() => {
    if (Object.keys(ftoSettings).length === 0) loadFTOSettings();
  }, [ftoSettings, loadFTOSettings]);

  // ----- Filter flights for the selected date -----
 // Excludes CANCELLED: cancelFlight() now soft-cancels (keeps the row,
  // for the Daily Flying Report's cancellation stats) instead of deleting
  // it, so the grid needs its own filter now to avoid rendering a ghost
  // block for a slot that's actually free again.
  const filteredFlights = scheduledFlights.filter(flight => {
    if (flight.status === 'CANCELLED') return false;
    const flightDate = new Date(flight.startTime).toLocaleDateString('en-CA');
    return flightDate === selectedDate;
  });

  // ----- Chart Configuration -----
  const HOURS = Array.from({ length: 17 }, (_, i) => i + 5); // 05:00 to 21:00 (17 hours)
  const activeAircraft = aircraft.filter(a => a.status !== 'GROUNDED'); // Only operational
  const totalHours = 17; // 5 AM to 10 PM = 17 hours

  // Refs for auto-centering the Gantt horizontally on the current time when
  // viewing today (see centerOnNow / the effect below) — scrollContainerRef
  // is the scrollable overflow-x-auto wrapper, innerGridRef is the
  // min-width content it scrolls. Reading real rendered widths off these
  // (rather than assuming the 1400px minimum) keeps the centering correct
  // on a wide desktop window where the grid stretches past 1400px.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const innerGridRef = useRef<HTMLDivElement>(null);

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================

  /**
   * Convert UTC ISO string to IST display format "HH:MM"
   * IST = UTC + 5:30
   */
    const formatISTTime = (isoString: string): string => {
      const date = new Date(isoString);
      // IST is UTC+5:30
      const utcHours = date.getUTCHours();
      const utcMinutes = date.getUTCMinutes();

      // Add 5 hours 30 minutes
      let istHours = utcHours + 5;
      let istMinutes = utcMinutes + 30;

      // Handle minute overflow
      if (istMinutes >= 60) {
        istHours += 1;
        istMinutes -= 60;
      }

      // Handle hour overflow (wrap around 24)
      istHours = istHours % 24;

      return `${String(istHours).padStart(2, '0')}:${String(istMinutes).padStart(2, '0')}`;
    };

  /**
   * Calculate position and width of a flight block on the Gantt chart.
   * Converts UTC time to IST, then to percentage-based positioning.
   */
  const getSlotStyle = (slot: FlightSlot | ScheduledFlight) => {
    const startDate = new Date(slot.startTime);
    const endDate = new Date(slot.endTime);

    // Convert UTC to IST properly
    const startUtcHours = startDate.getUTCHours();
    const startUtcMinutes = startDate.getUTCMinutes();
    let startIstHours = startUtcHours + 5;
    let startIstMinutes = startUtcMinutes + 30;
    if (startIstMinutes >= 60) { startIstHours += 1; startIstMinutes -= 60; }
    startIstHours = startIstHours % 24;
    const startHour = startIstHours + startIstMinutes / 60;

    const endUtcHours = endDate.getUTCHours();
    const endUtcMinutes = endDate.getUTCMinutes();
    let endIstHours = endUtcHours + 5;
    let endIstMinutes = endUtcMinutes + 30;
    if (endIstMinutes >= 60) { endIstHours += 1; endIstMinutes -= 60; }
    endIstHours = endIstHours % 24;
    const endHour = endIstHours + endIstMinutes / 60;

    const duration = endHour - startHour;
    if (duration <= 0) return { left: '0%', width: '0%' };
    const leftPercent = ((startHour - 5) / totalHours) * 100;
    const widthPercent = (duration / totalHours) * 100;
    return {
      left: `${Math.max(0, leftPercent)}%`,
      width: `calc(${Math.max(0, widthPercent)}% - 4px)`,
    };
  };

  /**
   * Current time in IST as a decimal hour (e.g. 14.5 = 14:30), or null if
   * outside the visible 05:00–22:00 grid window. Same UTC->IST conversion
   * used by the current-time line below and by centerOnNow, so both always
   * agree on "now".
   */
  const getCurrentISTHour = (): number | null => {
    const now = new Date();
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    let istHours = utcHours + 5;
    let istMinutes = utcMinutes + 30;
    if (istMinutes >= 60) { istHours += 1; istMinutes -= 60; }
    istHours = istHours % 24;
    const currentHourIST = istHours + istMinutes / 60;
    return currentHourIST >= 5 && currentHourIST <= 22 ? currentHourIST : null;
  };

  // Auto-center the Gantt horizontally on "now" whenever the board is
  // showing today — so instructors/students landing on this page
  // (especially on a phone or tablet, where most of the 1400px-wide grid
  // is off-screen) see the current time slot immediately instead of the
  // 05:00 start of the day. This only sets the initial scroll position;
  // it doesn't lock or clamp scrolling afterward, so free scrolling in
  // either direction still works exactly as before.
  const centerOnNow = () => {
    const container = scrollContainerRef.current;
    const inner = innerGridRef.current;
    if (!container || !inner) return;
    const currentHourIST = getCurrentISTHour();
    if (currentHourIST === null) return;
    const labelWidth = 140; // matches the sticky aircraft-label column's fixed w-[140px]
    const gridWidth = inner.clientWidth - labelWidth;
    const leftPercent = ((currentHourIST - 5) / totalHours) * 100;
    const targetX = labelWidth + (leftPercent / 100) * gridWidth;
    const viewportWidth = container.clientWidth;
    const maxScrollLeft = container.scrollWidth - viewportWidth;
    container.scrollLeft = Math.max(0, Math.min(targetX - viewportWidth / 2, maxScrollLeft));
  };

  // Center on mount and whenever the selected date becomes today (e.g.
  // navigating back with Prev/Next). Wrapped in requestAnimationFrame so it
  // runs after the browser has laid out the grid's real width, not the
  // pre-paint DOM.
  useEffect(() => {
    if (selectedDate !== todayLocal) return;
    const frame = requestAnimationFrame(centerOnNow);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, todayLocal]);

  // ----- Date navigation -----
  const changeDate = (days: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toLocaleDateString('en-CA'));
  };

  const goToToday = () => {
    setSelectedDate(todayLocal);
    // If already viewing today, the state above won't actually change, so
    // the selectedDate-keyed effect above won't re-fire — recenter
    // directly here too, so "Today" always doubles as a "jump back to
    // now" button even after the user has scrolled away.
    requestAnimationFrame(centerOnNow);
  };

  // Is the given date+"HH:MM" combination already in the past? Compared
  // against the browser's local clock — same assumption BookingForm's own
  // validateNotPast() makes (the FTO's users are physically in IST, so
  // local time doubles as IST here, same as the pre-existing `todayLocal`
  // above). Used to short-circuit a grid click before the BookingForm even
  // opens, instead of only surfacing "can't book in the past" after the
  // user fills the form in and hits Save.
  const isSlotInPast = (dateStr: string, timeStr: string): boolean => {
    const selected = new Date(`${dateStr}T${timeStr}:00`);
    return selected < new Date();
  };

  // Is this aircraft unavailable for booking on the currently viewed date —
  // either because its overall status is MAINTENANCE (indefinite, no known
  // end — always blocks the whole day), or because it has a maintenance
  // record scheduled/in-progress whose window overlaps this date? A record
  // can optionally carry a precise maintenanceStart/maintenanceEnd (ISO
  // timestamps, may span multiple days — e.g. a 3-day overhaul); when set,
  // only the portion of THIS date inside that window is blocked (full day
  // for a date strictly between start and end, partial for the start/end
  // day). When not set, the whole scheduledDate day is blocked — the
  // original/simple behavior, still the default in the form.
  // maintenanceEnd may itself be null (open-ended — emergency / still in
  // progress, finish time not known yet), which blocks every date from
  // maintenanceStart onward until the record is completed or an end is set.
  // Returns null (not blocked), or:
  //   { maintenanceType, allDay: true,  openEnded, overdue }                – whole day
  //   { maintenanceType, allDay: false, openEnded, overdue, startMin, endMin } – a window
  //     within this date, as minutes since midnight IST
  const getMaintenanceBlock = (aircraftId: string) => {
    if (aircraft.find(a => String(a.id) === String(aircraftId))?.status === 'MAINTENANCE') {
      return { maintenanceType: 'Maintenance', allDay: true as const, openEnded: false, overdue: false };
    }

    // IST day bounds for the currently viewed date, as real UTC instants —
    // same "+05:30" convention used everywhere a date+time gets parsed here.
    const dayStart = new Date(`${selectedDate}T00:00:00+05:30`);
    const dayEnd = new Date(`${selectedDate}T23:59:59.999+05:30`);

    const record = maintenanceRecords.find(m => {
      if (String(m.aircraftId) !== String(aircraftId)) return false;
      if (m.status !== 'SCHEDULED' && m.status !== 'IN_PROGRESS') return false;
      if (!m.maintenanceStart) {
        // Legacy/simple record — just a single scheduledDate, no precise window.
        return new Date(m.scheduledDate).toLocaleDateString('en-CA') === selectedDate;
      }
      const mStart = new Date(m.maintenanceStart);
      const mEnd = m.maintenanceEnd ? new Date(m.maintenanceEnd) : null;
      return mStart <= dayEnd && (mEnd === null || mEnd >= dayStart);
    });
    if (!record) return null;

    const mEndDate = record.maintenanceEnd ? new Date(record.maintenanceEnd) : null;
    // Overdue = passed its planned end while still SCHEDULED/IN_PROGRESS —
    // stays blocked regardless (never auto-unblocks on a timer), just
    // flagged so it can't be missed.
    const overdue = !!mEndDate && mEndDate < new Date();

    if (!record.maintenanceStart) {
      return { maintenanceType: record.maintenanceType, allDay: true as const, openEnded: false, overdue: false };
    }

    const mStart = new Date(record.maintenanceStart);
    const clampedStart = mStart < dayStart ? dayStart : mStart;
    const clampedEnd = mEndDate === null ? dayEnd : (mEndDate > dayEnd ? dayEnd : mEndDate);

    // Convert a UTC instant to its IST minute-of-day (0–1439), same
    // UTC->IST conversion used elsewhere on this board (formatISTTime,
    // getSlotStyle) — so this window lines up with flight blocks and the
    // hour grid exactly.
    const toISTMinuteOfDay = (d: Date): number => {
      const h = d.getUTCHours(); const m = d.getUTCMinutes();
      return ((h + 5) * 60 + (m + 30)) % 1440;
    };

    return {
      maintenanceType: record.maintenanceType,
      allDay: false as const,
      openEnded: mEndDate === null,
      overdue,
      startMin: toISTMinuteOfDay(clampedStart),
      endMin: toISTMinuteOfDay(clampedEnd),
    };
  };

  // Format minutes-since-midnight as "HH:MM"
  const minutesToHHMM = (min: number): string =>
    `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  // Does a maintenance block (from getMaintenanceBlock) cover the given "HH:MM" time?
  const isTimeBlockedByMaintenance = (
    block: ReturnType<typeof getMaintenanceBlock>,
    timeStr: string
  ): boolean => {
    if (!block) return false;
    if (block.allDay) return true;
    const [h, m] = timeStr.split(':').map(Number);
    const tMin = h * 60 + m;
    return tMin >= block.startMin && tMin < block.endMin;
  };

  // Left/width (%) for rendering a maintenance block's overlay — full width
  // for an all-day block, or the actual window (clamped to the 05:00–22:00
  // grid) positioned with the same percent math as flight blocks (getSlotStyle).
  const getMaintenanceBlockStyle = (block: ReturnType<typeof getMaintenanceBlock>) => {
    if (!block) return { left: '0%', width: '0%' };
    if (block.allDay) return { left: '0%', width: '100%' };
    const startHour = Math.max(5, block.startMin / 60);
    const endHour = Math.min(22, block.endMin / 60);
    if (endHour <= startHour) return { left: '0%', width: '0%' }; // window entirely outside the visible grid
    const leftPercent = ((startHour - 5) / totalHours) * 100;
    const widthPercent = ((endHour - startHour) / totalHours) * 100;
    return { left: `${leftPercent}%`, width: `${widthPercent}%` };
  };

  // Does this already-booked flight now overlap an active (SCHEDULED/
  // IN_PROGRESS) maintenance window for its own aircraft? Maintenance can be
  // logged after a flight was already booked (e.g. an emergency declared
  // mid-day), so this is computed live at render time against every flight
  // block currently on the board — not just checked once when the
  // maintenance record was created — so the conflict stays visible on the
  // board itself for as long as it's true, not just at creation time.
  const doesFlightConflictWithMaintenance = (flight: ScheduledFlight): boolean => {
    const fStart = new Date(flight.startTime);
    const fEnd = new Date(flight.endTime);
    const farFuture = new Date(8640000000000000);
    return maintenanceRecords.some(m => {
      if (String(m.aircraftId) !== String(flight.aircraftId)) return false;
      if (m.status !== 'SCHEDULED' && m.status !== 'IN_PROGRESS') return false;
      if (!m.maintenanceStart) {
        return new Date(flight.startTime).toLocaleDateString('en-CA') === new Date(m.scheduledDate).toLocaleDateString('en-CA');
      }
      const mStart = new Date(m.maintenanceStart);
      const mEnd = m.maintenanceEnd ? new Date(m.maintenanceEnd) : farFuture;
      return fStart < mEnd && fEnd > mStart;
    });
  };

  // ============================================================
  // PRINT FUNCTION – generates a clean white‑background report
  // ============================================================
  const handlePrint = () => {
    // Bug fix: this used to hardcode "Horizon Flight Training Academy" and
    // "VOBL – Bangalore" regardless of what's actually configured on the
    // Settings page. Falls back to those same defaults only if a school
    // hasn't set them yet. Location combines the (optional) ICAO code with
    // the (optional) free-text location name, same rule as the header.
    const printSchoolName = getFTOSetting('school_name') || 'Horizon Flight Training Academy';
    const printLocation = getLocationDisplay(getFTOSetting('airport_code'), getFTOSetting('location_name'));

    // Format the selected date for the report header
    const dateStr = new Date(selectedDate).toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    // Open a new window for the report
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // ----- Sortie colours for the printed report (hex values, kept in
    // sync with the SORTIE_COLOR_VARS tokens used on-screen — this is a
    // separate static HTML document, so it needs the actual hex, not a
    // CSS var reference). -----
    const sortiePrintColors: Record<string, string> = {
      DUAL: '#0891b2',
      SOLO: '#16a34a',
      MAINTENANCE: '#b45309',
    };

    // ----- Build unique instructor & student lists -----
    const instructorSet = new Map<string, string>();
    const studentSet = new Map<string, string>();

    filteredFlights.forEach(flight => {
      const inst = instructors.find(i => i.id === flight.instructorId);
      if (inst) instructorSet.set(inst.initials, inst.name);

      if (flight.studentId) {
        const stu = students.find(s => s.id === flight.studentId);
        if (stu) studentSet.set(stu.initials, stu.name);
      }
    });

    const instructorList = Array.from(instructorSet.entries())
      .map(([initials, name]) => `<tr><td>${initials}</td><td>${name}</td></tr>`)
      .join('');

    const studentList = Array.from(studentSet.entries())
      .map(([initials, name]) => `<tr><td>${initials}</td><td>${name}</td></tr>`)
      .join('');

    // ----- Build Gantt rows with merged blocks -----
    let ganttRows = '';

    activeAircraft.forEach(ac => {
      const flights = filteredFlights.filter(f => String(f.aircraftId) === String(ac.id));
      let cells = '';
      let hourIdx = 0;

      while (hourIdx < HOURS.length) {
        const hour = HOURS[hourIdx];

        // Find a flight that overlaps this hour
        const flight = flights.find(f => {
          const start = new Date(f.startTime);
          const end = new Date(f.endTime);
          const sH = (start.getUTCHours() + 5.5 + 24) % 24;
          const eH = (end.getUTCHours() + 5.5 + 24) % 24;
          return hour >= Math.floor(sH) && hour < Math.ceil(eH);
        });

        if (flight) {
          // Calculate how many consecutive hours this flight occupies
          const start = new Date(flight.startTime);
          const end = new Date(flight.endTime);
          const sH = Math.floor((start.getUTCHours() + 5.5 + 24) % 24);
          const eH = Math.ceil((end.getUTCHours() + 5.5 + 24) % 24);
          const span = Math.max(1, eH - sH);

          const color = sortiePrintColors[flight.sortieType] || '#6b7280';
          // Use exercise short code if available, otherwise fall back to sortie label
          const label = getExerciseShortCode(flight.exercise || '') ||
                        SORTIE_LABELS[flight.sortieType] ||
                        flight.sortieType;
          const stu = flight.studentId ? students.find(s => s.id === flight.studentId) : undefined;
          const inst = instructors.find(i => i.id === flight.instructorId);

          cells += `<td colspan="${span}" style="background:${color};">
            <div style="padding:4px;font-size:9px;color:#fff;font-weight:600;">
              ${stu?.initials || '—'}/${inst?.initials || '—'}<br/>${label}
            </div>
          </td>`;
          hourIdx += span;
        } else {
          cells += `<td></td>`;
          hourIdx++;
        }
      }

      ganttRows += `<tr>
        <td style="font-weight:700;font-size:11px;">
          ${ac.registration}<br/><span style="font-size:9px;color:#64748b;">${ac.type}</span>
        </td>
        ${cells}
      </tr>`;
    });

    // ----- Sortie type legend rows -----
    let sortieLegendRows = '';
    const sortieEntries = Object.entries(sortiePrintColors);
    for (let i = 0; i < sortieEntries.length; i += 4) {
      const chunk = sortieEntries.slice(i, i + 4);
      sortieLegendRows += `<tr>${chunk.map(([key, color]) =>
        `<td>
          <span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${color};margin-right:6px;"></span>
          ${SORTIE_LABELS[key] || key}
        </td>`
      ).join('')}</tr>`;
    }

    // ----- Exercise legend rows -----
    let exerciseLegendRows = '';
    for (let i = 0; i < exerciseEntries.length; i += 2) {
      const left = exerciseEntries[i];
      const right = exerciseEntries[i + 1];
      exerciseLegendRows += `<tr>
        <td style="font-weight:600;font-size:10px;">${left[1]}</td>
        <td style="font-size:10px;color:#555;">${left[0].split(' - ')[1] || left[0]}</td>
        ${right ? `<td style="font-weight:600;font-size:10px;">${right[1]}</td>
        <td style="font-size:10px;color:#555;">${right[0].split(' - ')[1] || right[0]}</td>` : '<td></td><td></td>'}
      </tr>`;
    }

    // Column width for the Gantt table
    const colWidth = `${100 / (HOURS.length + 1)}%`;

    // ----- Assemble the complete HTML document -----
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Flight Schedule – ${dateStr}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: 'Segoe UI', Arial, sans-serif;
              padding: 24px;
              color: #1e293b;
              background: #fff;
            }
            h2 { text-align: center; font-size: 20px; margin-bottom: 4px; }
            .sub { text-align: center; font-size: 12px; color: #64748b; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 16px; }
            th {
              background: #1e293b; color: #fff; padding: 6px 4px;
              border: 1px solid #334155; font-size: 10px; text-align: center;
            }
            td {
              padding: 6px 2px; border: 1px solid #cbd5e1;
              text-align: center; height: 40px;
            }
            h3 { font-size: 12px; margin-top: 16px; margin-bottom: 8px; }
            .footer {
              margin-top: 24px; text-align: center; font-size: 10px;
              color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px;
            }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <h2>✈️ FlightPro Manager – Daily Operations Sheet</h2>
          <p class="sub">
            ${printSchoolName} | ${printLocation}<br/>
            ${dateStr} | All times in IST
          </p>

          <!-- Gantt‑style schedule -->
          <table>
            <thead>
              <tr>
                <th style="width:${colWidth}">Aircraft</th>
                ${HOURS.map(h => `<th style="width:${colWidth}">${h.toString().padStart(2,'0')}:00</th>`).join('')}
              </tr>
            </thead>
            <tbody>${ganttRows}</tbody>
          </table>

          <!-- Instructor & Student lists -->
          <div style="display:flex; gap:40px; margin-top:24px;">
            <div style="flex:1;">
              <h3>👨‍🏫 Instructors</h3>
              <table>
                <thead><tr><th>Initials</th><th>Name</th></tr></thead>
                <tbody>${instructorList || '<tr><td colspan="2">—</td></tr>'}</tbody>
              </table>
            </div>
            <div style="flex:1;">
              <h3>👨‍✈️ Students</h3>
              <table>
                <thead><tr><th>Initials</th><th>Name</th></tr></thead>
                <tbody>${studentList || '<tr><td colspan="2">—</td></tr>'}</tbody>
              </table>
            </div>
          </div>

          <!-- Sortie colour legend -->
          <h3>Sortie Types</h3>
          <table>${sortieLegendRows}</table>

          <!-- Exercise codes legend -->
          <h3>Exercise Codes</h3>
          <table>${exerciseLegendRows}</table>

          <div class="footer">
            Generated by FlightPro Manager &nbsp;|&nbsp; ${new Date().toLocaleString('en-IN')}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();

    // Give the browser a moment to render, then open print dialog
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  // ----- Event handlers -----
  const handleSlotClick = (slot: FlightSlot) => setSelectedSlot(slot);

  const handleCloseModal = () => {
    setSelectedSlot(null);   // Cache already fresh — cancelFlight/updateScheduledFlight local-splice
  };

  // Click-to-book: figure out the time from where the user clicked within
  // an aircraft's row, then open BookingForm pre-filled with that aircraft,
  // the currently selected date, and the computed time. Works for however
  // many aircraft are in the fleet — the row and its aircraft ID come
  // straight from the `activeAircraft.map(...)` below, nothing here assumes
  // a fixed count.
  const handleGridClick = (aircraftId: string, e: React.MouseEvent<HTMLDivElement>) => {
    // Not authorized to create a brand-new booking at all — see
    // canCreateBooking above. Checked first, before any of the time/
    // maintenance/holiday validation below, so the message is unambiguous.
    if (!canCreateBooking) {
      setErrorMessage(
        sessionRole === 'instructor'
          ? 'You don’t have permission to create a new booking. Ask a super admin to enable self-booking for your instructor profile.'
          : 'You don’t have permission to create a new booking. This schedule is view-only for your role.'
      );
      setTimeout(() => setErrorMessage(''), 4000);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clickPercent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    // Same 05:00–22:00 span the Gantt blocks are positioned against (HOURS
    // starts at 5, totalHours is 17) — map the click position back to a
    // clock time, then round to the nearest 30 minutes (matches BookingForm's
    // time dropdown granularity) and clamp to what that dropdown offers
    // (06:00–22:30).
    const rawHour = 5 + clickPercent * totalHours;
    let snappedMinutes = Math.round((rawHour * 60) / 30) * 30;
    snappedMinutes = Math.min(22 * 60 + 30, Math.max(6 * 60, snappedMinutes));
    const hour = Math.floor(snappedMinutes / 60);
    const minute = snappedMinutes % 60;
    const startTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    // Reject clicks on a date the FTO is closed — a holiday or the weekly
    // off day — before ever considering maintenance/past-time blocks.
    if (dateBlockReason) {
      setErrorMessage(`FTO is closed on ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} (${dateBlockReason.label}) — flights cannot be booked on this date.`);
      setTimeout(() => setErrorMessage(''), 4000);
      return;
    }

    // Reject clicks that land inside a maintenance block — either the whole
    // day (aircraft.status === 'MAINTENANCE', or a record with no precise
    // window set) or just the portion of this date covered by a record's
    // maintenanceStart/maintenanceEnd window (which may span multiple days).
    const maintenanceBlock = getMaintenanceBlock(aircraftId);
    if (isTimeBlockedByMaintenance(maintenanceBlock, startTime)) {
      const ac = aircraft.find(a => String(a.id) === String(aircraftId));
      const when = maintenanceBlock!.allDay
        ? (ac?.status === 'MAINTENANCE' ? 'in progress' : `scheduled on ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`)
        : maintenanceBlock!.openEnded
          ? `from ${minutesToHHMM(maintenanceBlock!.startMin)} — still in progress, no end time set yet`
          : `from ${minutesToHHMM(maintenanceBlock!.startMin)} to ${minutesToHHMM(maintenanceBlock!.endMin)}`;
      const overdueNote = maintenanceBlock!.overdue ? ' (past its planned finish — check the maintenance log)' : '';
      setErrorMessage(`${ac?.registration || 'This aircraft'} is unavailable at ${startTime} — ${maintenanceBlock!.maintenanceType} maintenance ${when}.${overdueNote}`);
      setTimeout(() => setErrorMessage(''), 4000);
      return;
    }

    // Reject clicks on a past time slot immediately, instead of only
    // surfacing "can't book in the past" after the user opens the form,
    // fills it in, and hits Save.
    if (isSlotInPast(selectedDate, startTime)) {
      setErrorMessage(`${startTime} on ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} is in the past — flights cannot be booked in the past. Please pick a future time slot.`);
      setTimeout(() => setErrorMessage(''), 4000);
      return;
    }

    setGridClickPrefill({ aircraftId, date: selectedDate, startTime });
    setEditingFlight(null);
    setShowBookingForm(true);
  };

  // Drag-and-drop rescheduling — mirrors handleGridClick's time-from-x-
  // position math and validation (date closed / maintenance block / past),
  // then reuses the store's own checkConflicts (excluding the flight being
  // moved) before calling updateScheduledFlight. Only SCHEDULED flights are
  // draggable (see draggable= on the block below), so IN_PROGRESS/COMPLETED/
  // CANCELLED flights can't be dragged in the first place.
  const handleFlightDragStart = (e: React.DragEvent, flight: ScheduledFlight) => {
    e.dataTransfer.setData('text/plain', flight.id); // required by Firefox for drag to start
    e.dataTransfer.effectAllowed = 'move';
    setDraggingFlight(flight);
  };

  const handleRowDragOver = (e: React.DragEvent, aircraftId: string) => {
    if (!draggingFlight) return;
    e.preventDefault(); // required to allow a drop
    e.dataTransfer.dropEffect = 'move';
    setDragOverAircraftId(aircraftId);
  };

  const handleRowDrop = async (e: React.DragEvent, aircraftId: string) => {
    e.preventDefault();
    const flight = draggingFlight;
    setDraggingFlight(null);
    setDragOverAircraftId(null);
    if (!flight) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const dropPercent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const rawHour = 5 + dropPercent * totalHours;
    let snappedMinutes = Math.round((rawHour * 60) / 30) * 30;
    snappedMinutes = Math.min(22 * 60 + 30, Math.max(6 * 60, snappedMinutes));
    const hour = Math.floor(snappedMinutes / 60);
    const minute = snappedMinutes % 60;
    const startTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    if (dateBlockReason) {
      setErrorMessage(`FTO is closed on ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} (${dateBlockReason.label}) — flights cannot be rescheduled to this date.`);
      setTimeout(() => setErrorMessage(''), 4000);
      return;
    }

    const maintenanceBlock = getMaintenanceBlock(aircraftId);
    if (isTimeBlockedByMaintenance(maintenanceBlock, startTime)) {
      const ac = aircraft.find(a => String(a.id) === String(aircraftId));
      setErrorMessage(`${ac?.registration || 'This aircraft'} is unavailable at ${startTime} — ${maintenanceBlock!.maintenanceType} maintenance.`);
      setTimeout(() => setErrorMessage(''), 4000);
      return;
    }

    if (isSlotInPast(selectedDate, startTime)) {
      setErrorMessage(`${startTime} on ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} is in the past — flights cannot be rescheduled into the past.`);
      setTimeout(() => setErrorMessage(''), 4000);
      return;
    }

    const durationMs = new Date(flight.endTime).getTime() - new Date(flight.startTime).getTime();
    const newStart = new Date(`${selectedDate}T${startTime}:00+05:30`);
    const newEnd = new Date(newStart.getTime() + durationMs);

    const conflict = await checkConflicts(aircraftId, newStart.toISOString(), newEnd.toISOString(), flight.id);
    if (conflict.hasConflict) {
      setErrorMessage(`❌ ${aircraft.find(a => String(a.id) === String(aircraftId))?.registration || 'This aircraft'} is already booked around ${startTime} — pick a different time or aircraft.`);
      setTimeout(() => setErrorMessage(''), 4000);
      return;
    }

    await updateScheduledFlight(flight.id, {
      aircraftId,
      startTime: newStart.toISOString(),
      endTime: newEnd.toISOString(),
    });
    setSuccessMessage(`✅ Rescheduled to ${startTime} IST${String(aircraftId) !== String(flight.aircraftId) ? ` on ${aircraft.find(a => String(a.id) === String(aircraftId))?.registration || 'the new aircraft'}` : ''}.`);
    setTimeout(() => setSuccessMessage(''), 3000);
    // Cache already fresh — updateScheduledFlight local-splices.
  };

  const handleBookingSuccess = (message: string) => {
    setShowBookingForm(false);
    setEditingFlight(null);
    setGridClickPrefill(null);
    setSuccessMessage(message);
    // Cache already fresh — bookFlight revalidates via mutate(key) on success.
    setTimeout(() => setSuccessMessage(''), 3000); // Auto‑hide toast after 3 seconds
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <>
      {/* Main Schedule Board Container */}
      <div className="surface-card p-4 sm:p-6">

        {/* ----- Header Section ----- */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-secondary" /> Flight Operations Board
            </h2>
            <p className="text-sm text-secondary mt-1">
              {new Date(selectedDate).toLocaleDateString('en-US', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              <span className="text-xs text-tertiary ml-2">All times in IST</span>
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="px-4 py-2 surface-inner text-secondary rounded-lg text-sm hover:text-accent transition cursor-pointer flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" /> Print Schedule
            </button>
            {canCreateBooking ? (
              <button
                onClick={() => {
                  setGridClickPrefill(null);
                  setEditingFlight(null);
                  setShowBookingForm(true);
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer flex items-center gap-1.5"
                style={{ backgroundImage: 'linear-gradient(135deg, var(--accent-strong), var(--accent))', color: '#ffffff' }}
              >
                <Plus className="w-3.5 h-3.5" /> Book Slot
              </button>
            ) : sessionRole === 'instructor' ? (
              <span
                className="px-3 py-2 surface-inner text-tertiary rounded-lg text-xs flex items-center gap-1.5"
                title="Ask a super admin to enable self-booking for your instructor profile."
              >
                <Lock className="w-3.5 h-3.5" /> Booking not enabled
              </span>
            ) : (
              <span className="px-3 py-2 surface-inner text-tertiary rounded-lg text-xs flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> View only
              </span>
            )}
          </div>
        </div>

        {/* ----- Date Picker ----- */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="text-sm text-secondary">Date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="surface-inner rounded-lg px-3 py-1 text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
          <button
            onClick={() => changeDate(-1)}
            className="px-3 py-1 surface-inner text-secondary rounded text-sm hover:text-accent transition"
          >
            ← Prev
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1 rounded text-sm font-medium transition"
            style={{ backgroundImage: 'linear-gradient(135deg, var(--accent-strong), var(--accent))', color: '#ffffff' }}
          >
            Today
          </button>
          <button
            onClick={() => changeDate(1)}
            className="px-3 py-1 surface-inner text-secondary rounded text-sm hover:text-accent transition"
          >
            Next →
          </button>
        </div>

        {/* ----- FTO Closed Banner (holiday / weekly off day) ----- */}
        {dateBlockReason && (
          <div
            className="mb-4 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ backgroundColor: 'var(--warning-soft)', color: 'var(--warning-text)' }}
          >
            🚫 FTO is closed on this date ({dateBlockReason.label}) — flights and ground-school classes cannot be booked.
          </div>
        )}

        {/* ----- Grid Line Legend ----- */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mb-3 text-xs text-tertiary">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-0 border-t" style={{ borderColor: 'var(--border)' }} />
            <span>Hour (IST)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-0 border-t border-dashed" style={{ borderColor: 'var(--border)' }} />
            <span>Half‑hour (IST)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-0 border-t border-dotted" style={{ borderColor: 'var(--accent)' }} />
            <span>UTC Hour</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: 'var(--danger)' }} />
            <span style={{ color: 'var(--danger)' }}>Current Time (IST)</span>
          </div>
        </div>

        {/* ----- Gantt Chart Area ----- */}
        <div ref={scrollContainerRef} className="overflow-x-auto scrollbar-thin" style={{ overflowX: 'auto' }}>
          <div ref={innerGridRef} className="min-w-[1400px]">

            {/* Time Header Row – Shows hours from 06:00 to 19:00 with IST and UTC labels.
                Each label is positioned with the SAME `(idx / HOURS.length) * 100%` formula
                used by the Vertical Grid Lines below, the current-time line, and flight
                blocks (getSlotStyle's leftPercent), and now sits FLUSH (left: 0 on both
                lines of text, no left-2/left-1 padding) against that position, with a tiny
                downward tick mark as an explicit visual pointer from the label down to the
                line it belongs to. Previously the label text was padded 8px/4px to the right
                of its own anchor point purely for breathing room — reasonable in isolation,
                but placed directly above a 17-column grid, it read as the label not lining up
                with "its" line, since the line sat 8px to the label's left. Flush + a tick
                removes the ambiguity: the label, the tick, and the line are all the same x. */}
            <div className="flex mb-1">
              <div className="w-[140px] flex-shrink-0 sticky left-0 z-20" />
              <div className="flex-1 relative">
                {HOURS.map((hour, idx) => {
                  const utcHour = (hour - 5.5 + 24) % 24;
                  const leftPercent = (idx / HOURS.length) * 100;
                  return (
                    <div key={hour} className="absolute top-0" style={{ left: `${leftPercent}%` }}>
                      <span className="text-xs text-secondary font-medium absolute -top-0 left-0 whitespace-nowrap">
                        {hour.toString().padStart(2, '0')}:00
                      </span>
                      <span className="text-[9px] absolute top-4 left-0 whitespace-nowrap" style={{ color: 'var(--accent)', opacity: 0.6 }}>
                        {Math.floor(utcHour).toString().padStart(2, '0')}:30 UTC
                      </span>
                      {/* Tick mark pointing down at the exact x-position of this hour's
                          gridline in the row below, so the eye has an explicit connector
                          between the label and its line instead of having to infer it. */}
                      <div className="absolute top-[26px] left-0 w-px h-2" style={{ backgroundColor: 'var(--border)' }} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Aircraft Rows Container */}
            <div className="relative mt-8">

              {/* Vertical Grid Lines – Solid for hours, dashed for half‑hours, dotted for UTC.
                  Positioned with the SAME `(idx / HOURS.length) * 100%` formula as the Time
                  Header Row's labels above (and the current-time line / flight blocks below),
                  instead of its own separate HOURS.length-column flex partition — see the
                  comment on the Time Header Row for why sharing one formula matters. This also
                  fixes a pre-existing bug where this row rendered one extra unlabeled flex-1
                  column beyond the header's 17, silently narrowing every column here relative
                  to the header. */}
              <div className="absolute inset-0 flex pointer-events-none z-0">
                <div className="w-[140px] flex-shrink-0 sticky left-0 pr-3 flex flex-col justify-center z-20 rounded-l-lg px-2 py-1 pt-2" style={{ backgroundColor: 'var(--surface)' }}></div>

                <div className="flex-1 relative">
                  {HOURS.map((hour, idx) => {
                    const leftPercent = (idx / HOURS.length) * 100;
                    const halfHourPercent = ((idx + 0.5) / HOURS.length) * 100;
                    return (
                      <React.Fragment key={hour}>
                        {/* IST Hour line - solid, aligned under this hour's header label */}
                        <div className="absolute top-0 bottom-0 border-l" style={{ left: `${leftPercent}%`, borderColor: 'var(--border)' }} />
                        {/* IST Half-hour line - dashed */}
                        <div className="absolute top-0 bottom-0 border-l border-dashed" style={{ left: `${halfHourPercent}%`, borderColor: 'var(--border)' }} />
                        {/* UTC Hour line - dotted (coincides with the IST half-hour mark, since IST = UTC + 5:30) */}
                        <div className="absolute top-0 bottom-0 border-l border-dotted" style={{ left: `${halfHourPercent}%`, borderColor: 'var(--accent)', opacity: 0.3 }} />
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* Horizontal Row Lines – Alternating background for readability */}
              <div className="absolute inset-0 flex flex-col pointer-events-none z-0">
                {activeAircraft.map((ac, index) => (
                  <div key={ac.id} className="relative mb-3" style={{ minHeight: '60px' }}>
                    <div
                      className="absolute inset-0 rounded-lg"
                      style={index % 2 === 0 ? { backgroundColor: 'color-mix(in srgb, var(--text-secondary) 6%, transparent)' } : undefined}
                    />
                    <div className="absolute bottom-0 left-0 right-0 border-b" style={{ borderColor: 'var(--border)' }} />
                  </div>
                ))}
              </div>

              {/* Current Time Line – Red vertical line showing current IST time (only when viewing today).
                  Wrapped in the same 140px-label-spacer + flex-1 structure used by the header row
                  and every flight-blocks-area div below, so `leftPercent` resolves against the
                  grid-only width. Previously this was positioned with `calc(X% + 140px)` directly
                  against the full-width row container, which resolves the `%` against the FULL
                  width (including the 140px label column) and then added 140px on top of that —
                  double-counting the label offset and pushing the line noticeably too far right
                  (worse the wider the browser window, since the grid area grows with it). */}
              {selectedDate === todayLocal && (() => {
                const now = new Date();
                const utcHours = now.getUTCHours();
                const utcMinutes = now.getUTCMinutes();
                let istHours = utcHours + 5;
                let istMinutes = utcMinutes + 30;
                if (istMinutes >= 60) { istHours += 1; istMinutes -= 60; }
                istHours = istHours % 24;
                const currentHourIST = istHours + istMinutes / 60;

                if (currentHourIST >= 5 && currentHourIST <= 22) {
                  const leftPercent = ((currentHourIST - 5) / totalHours) * 100;
                  return (
                    <div className="absolute inset-0 flex z-30 pointer-events-none">
                      <div className="w-[140px] flex-shrink-0" />
                      <div className="flex-1 relative">
                        <div className="absolute top-0 bottom-0" style={{ left: `${leftPercent}%` }}>
                          <div className="absolute inset-0 w-0.5" style={{ backgroundColor: 'var(--danger)', opacity: 0.7 }} />
                          <div className="absolute -top-1 -left-1.5 w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: 'var(--danger)', boxShadow: '0 0 12px 2px color-mix(in srgb, var(--danger) 50%, transparent)' }} />
                          <div className="absolute -top-6 -left-10 text-[10px] whitespace-nowrap font-medium px-1 rounded" style={{ color: 'var(--danger)', backgroundColor: 'color-mix(in srgb, var(--surface) 80%, transparent)' }}>
                            {String(istHours).padStart(2, '0') + ':' + String(istMinutes).padStart(2, '0')} IST
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Render each active aircraft as a row */}
              {activeAircraft.map(ac => {
                const realFlights = filteredFlights.filter(
                  f => String(f.aircraftId) === String(ac.id)
                );
                // Aircraft under maintenance (status === 'MAINTENANCE') or with a
                // SCHEDULED/IN_PROGRESS maintenance record for the currently viewed
                // date. allDay (no scheduledTime set on the record, or an indefinite
                // aircraft.status) blocks the whole row; otherwise only the record's
                // scheduledTime + durationHours window is blocked.
                const maintenanceBlock = getMaintenanceBlock(ac.id);
                const maintenanceBlockStyle = getMaintenanceBlockStyle(maintenanceBlock);
                const statusColor = ac.status === 'ACTIVE' ? 'var(--success)' : ac.status === 'MAINTENANCE' ? 'var(--warning)' : 'var(--danger)';
                return (
                  <div key={ac.id} className="relative mb-3 z-10">
                    <div className="flex items-stretch" style={{ minHeight: '60px' }}>

                      {/* Aircraft Label – Left column with registration, type, hours, fuel.
                          Sticky so it stays pinned to the left edge while the grid scrolls
                          horizontally (e.g. scrolling right to book a late slot) — previously
                          this scrolled away with the rest of the row, so once you scrolled far
                          enough right there was no way to tell which aircraft's row you were
                          looking at. Solid background (not /80) + a higher z-index than flight
                          blocks so blocks that scroll underneath don't show through it. */}
                      <div className="w-[140px] flex-shrink-0 sticky left-0 pr-3 flex flex-col justify-center z-40 rounded-l-lg px-2 py-1" style={{ backgroundColor: 'var(--surface)' }}>
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor }} />
                          <div>
                            <p className="text-sm font-semibold">{ac.registration}</p>
                            <p className="text-xs text-secondary">{ac.type}</p>
                          </div>
                        </div>
                        <div className="text-xs text-tertiary mt-1">
                          {ac.hobbsTime}h | {ac.currentFuel}L
                        </div>
                      </div>

                      {/* Flight Blocks Area – Where colored blocks appear. Also
                          doubles as the click-to-book target: clicking any
                          empty spot opens BookingForm pre-filled with this
                          aircraft, the selected date, and the time under the
                          click. Clicks on an existing flight block are
                          stopped from bubbling here (see that block's
                          onClick), so they only open the detail modal.
                          handleGridClick itself checks whether the clicked
                          time falls inside a maintenance block (whole-day or
                          just the record's window) and shows an "unavailable"
                          message instead of opening the booking form when it
                          does — so a partial-day maintenance window only
                          blocks clicks inside that window, not the whole row. */}
                      <div
                        onClick={(e) => handleGridClick(ac.id, e)}
                        onDragOver={(e) => handleRowDragOver(e, ac.id)}
                        onDragLeave={() => setDragOverAircraftId(prev => (prev === ac.id ? null : prev))}
                        onDrop={(e) => handleRowDrop(e, ac.id)}
                        className={`flex-1 relative border rounded-r-lg transition ${
                          maintenanceBlock?.allDay ? 'cursor-not-allowed' : 'cursor-pointer'
                        }`}
                        style={{
                          minHeight: '55px',
                          // Translucent (not the opaque surface-inner fill) so the
                          // z-0 hour/half-hour grid lines behind this row alpha-
                          // blend through and stay visible — matching how the
                          // pre-redesign bg-slate-900/20 background looked, and
                          // keeping every row visually uniform with the gaps
                          // between rows instead of blotting the lines out.
                          backgroundColor: dragOverAircraftId === ac.id
                            ? 'color-mix(in srgb, var(--accent) 18%, transparent)'
                            : 'color-mix(in srgb, var(--surface-muted) 35%, transparent)',
                          borderColor: dragOverAircraftId === ac.id
                            ? 'var(--accent)'
                            : maintenanceBlock?.allDay
                              ? (maintenanceBlock.overdue ? 'color-mix(in srgb, var(--danger) 40%, transparent)' : 'color-mix(in srgb, var(--warning) 30%, transparent)')
                              : 'color-mix(in srgb, var(--border) 50%, transparent)',
                        }}
                        title={
                          maintenanceBlock?.allDay
                            ? `${ac.registration} unavailable — ${maintenanceBlock.maintenanceType} maintenance${maintenanceBlock.overdue ? ' (overdue)' : ''}`
                            : maintenanceBlock
                              ? `${ac.registration} unavailable ${minutesToHHMM(maintenanceBlock.startMin)}–${maintenanceBlock.openEnded ? 'ongoing' : minutesToHHMM(maintenanceBlock.endMin)} — ${maintenanceBlock.maintenanceType} maintenance${maintenanceBlock.overdue ? ' (overdue)' : ''}`
                              : 'Click to book a flight at this time'
                        }
                      >
                        {/* Maintenance overlay – diagonal-striped backdrop covering either the
                            whole row (allDay) or just the record's window for this date (which
                            may be a partial slice of a multi-day job), sitting below existing
                            flight blocks (z-10+) so any bookings made before the maintenance was
                            scheduled stay visible, but above the empty "Available" hint. Turns
                            red/urgent once it's overdue (past its planned end but still
                            SCHEDULED/IN_PROGRESS) — stays blocked either way, this is purely a
                            visibility cue so it doesn't quietly sit there unnoticed. */}
                        {maintenanceBlock && (
                          <div
                            className="absolute top-1 bottom-1 z-[5] flex items-center justify-center pointer-events-none rounded-md overflow-hidden"
                            style={{
                              ...maintenanceBlockStyle,
                              background: maintenanceBlock.overdue
                                ? 'repeating-linear-gradient(45deg, rgba(239,68,68,0.22), rgba(239,68,68,0.22) 10px, rgba(239,68,68,0.06) 10px, rgba(239,68,68,0.06) 20px)'
                                : 'repeating-linear-gradient(45deg, rgba(234,179,8,0.15), rgba(234,179,8,0.15) 10px, rgba(234,179,8,0.04) 10px, rgba(234,179,8,0.04) 20px)',
                            }}
                          >
                            <span
                              className="text-xs font-semibold px-2 py-1 rounded whitespace-nowrap flex items-center gap-1"
                              style={{
                                backgroundColor: 'color-mix(in srgb, var(--surface) 85%, transparent)',
                                color: maintenanceBlock.overdue ? 'var(--danger)' : 'var(--warning-text)',
                              }}
                            >
                              <Wrench className="w-3 h-3 flex-shrink-0" />
                              {!maintenanceBlock.allDay && `${minutesToHHMM(maintenanceBlock.startMin)}–${maintenanceBlock.openEnded ? '…' : minutesToHHMM(maintenanceBlock.endMin)} `}
                              {maintenanceBlock.maintenanceType}
                              {maintenanceBlock.openEnded ? ' (ongoing)' : ''}{maintenanceBlock.overdue ? ' OVERDUE' : ''}
                            </span>
                          </div>
                        )}

                        {realFlights.map(flight => {
                          const style = getSlotStyle(flight);
                          // Use sortie type color: Dual=accent, Solo=success, Maintenance=warning
                          const blockColor = SORTIE_COLOR_VARS[flight.sortieType] || 'var(--text-secondary)';
                          const instructor = instructors.find(i => i.id === flight.instructorId);
                          const student = flight.studentId
                            ? students.find(s => s.id === flight.studentId)
                            : undefined;
                          const isHovered = hoveredSlot === flight.id;
                          const flightStartIST = formatISTTime(flight.startTime);
                          const hasMaintenanceConflict = doesFlightConflictWithMaintenance(flight);
                          // Only a SCHEDULED flight can be dragged to reschedule (an
                          // in-progress/completed/cancelled flight has already happened
                          // or is happening — nothing to move), and only for someone
                          // who'd be allowed to create/edit a booking in the first
                          // place (same gate as the empty-slot click-to-book above).
                          const isDraggable = canCreateBooking && flight.status === 'SCHEDULED';

                          // Get exercise name and extract short code
                          const exerciseName = flight.exercise || '';
                          const shortCode = getExerciseShortCode(exerciseName);

                          return (
                            <div
                              key={flight.id}
                              draggable={isDraggable}
                              onDragStart={(e) => isDraggable && handleFlightDragStart(e, flight)}
                              onDragEnd={() => { setDraggingFlight(null); setDragOverAircraftId(null); }}
                              onClick={(e) => {
                                // Don't let this bubble up to the row's
                                // click-to-book handler — an existing block
                                // should only open its own detail modal.
                                e.stopPropagation();
                                handleSlotClick(flight as unknown as FlightSlot);
                              }}
                              onMouseEnter={() => setHoveredSlot(flight.id)}
                              onMouseLeave={() => setHoveredSlot(null)}
                              className={`absolute top-1 bottom-1 border rounded-md px-2 py-1
                                cursor-pointer transition-all duration-200
                                hover:scale-[1.03] hover:z-30 hover:shadow-xl
                                ${isDraggable ? 'active:cursor-grabbing' : ''}
                                ${isHovered ? 'ring-2 ring-white/50 z-20 scale-[1.03] shadow-xl' : 'z-10'}
                                ${flight.status === 'IN_PROGRESS' ? 'ring-1' : ''}
                                ${hasMaintenanceConflict ? 'ring-2 animate-pulse' : ''}
                                ${draggingFlight?.id === flight.id ? 'opacity-40' : ''}`}
                              style={{
                                ...style,
                                backgroundColor: `color-mix(in srgb, ${blockColor} 80%, transparent)`,
                                borderColor: blockColor,
                                ...(flight.status === 'IN_PROGRESS' ? { boxShadow: `0 0 0 1px color-mix(in srgb, var(--success) 50%, transparent)` } : {}),
                                ...(hasMaintenanceConflict ? { boxShadow: '0 0 0 2px var(--danger)' } : {}),
                              }}
                              title={`${student?.name || flight.studentName || 'No Student'} - ${exerciseName || flight.sortieType}\n${flightStartIST} IST${hasMaintenanceConflict ? '\nConflicts with scheduled maintenance on this aircraft — reassign or cancel' : ''}${isDraggable ? '\nDrag to reschedule' : ''}`}
                            >
                              {flight.status === 'IN_PROGRESS' && (
                                <span className="absolute top-1 right-1 w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--success)' }} />
                              )}
                              {hasMaintenanceConflict && (
                                <span
                                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center shadow-lg z-20"
                                  style={{ backgroundColor: 'var(--danger)' }}
                                  title="Conflicts with scheduled maintenance"
                                >
                                  <TriangleAlert className="w-2.5 h-2.5" style={{ stroke: '#ffffff' }} />
                                </span>
                              )}
                              <div className="flex flex-col justify-center h-full min-w-0">
                                {/* Student initials / Instructor initials */}
                                <p className="text-xs font-bold truncate" style={{ color: '#ffffff' }}>
                                  {student?.initials || '—'}/
                                  {instructor?.initials ||
                                    (flight.sortieType === 'SOLO' ? 'SOLO' :
                                     flight.sortieType === 'MAINTENANCE' ? 'MTX' : '—')}
                                </p>
                                {/* Exercise short code (e.g., "CCTS", "ST&RE") */}
                                <p className="text-[10px] truncate font-medium" style={{ color: 'rgba(255,255,255,0.8)' }}>
                                  {shortCode || exerciseName}
                                </p>
                                {/* Date and start time */}
                                <p className="text-[9px] truncate" style={{ color: 'rgba(255,255,255,0.6)' }}>
                                  {new Date(flight.startTime).toLocaleDateString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                  })} {flightStartIST}
                                </p>
                              </div>
                            </div>
                          );
                        })}

                        {/* Empty state when no flights scheduled and not blocked for the whole day
                            (an all-day maintenance block shows its own label instead; a partial
                            window still leaves the rest of the day free, so the hint stays). */}
                        {realFlights.length === 0 && !maintenanceBlock?.allDay && (
                          <div className="flex items-center justify-center h-full pointer-events-none">
                            <p className="text-xs text-tertiary">Available — click to book</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ----- Legend Section ----- */}
        <div className="mt-6 pt-4 border-t divider">

          {/* Sortie Type Legend */}
          <h3 className="text-sm font-medium text-secondary mb-3">Sortie Types</h3>
          <div className="flex flex-wrap gap-3 mb-4">
            {Object.entries(SORTIE_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center space-x-1.5">
                <div
                  className="w-3 h-3 rounded border"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${SORTIE_COLOR_VARS[key] || 'var(--text-secondary)'} 80%, transparent)`,
                    borderColor: SORTIE_COLOR_VARS[key] || 'var(--text-secondary)',
                  }}
                />
                <span className="text-xs text-secondary">{label}</span>
              </div>
            ))}
          </div>

          {/* Exercise Legend – Table format with visible short codes (3 columns on desktop/tablet,
              stacks to a simpler 1-column list on mobile since a 6-column table is unreadable
              at phone width). */}
          <h3 className="text-sm font-medium mb-3 mt-4 flex items-center gap-1.5">
            <ClipboardList className="w-3.5 h-3.5 text-secondary" /> Exercise Codes
          </h3>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-secondary border-b divider">
                  <th className="pb-2 pr-2 font-medium">Code</th>
                  <th className="pb-2 pr-4 font-medium">Description</th>
                  <th className="pb-2 pr-2 pl-2 font-medium">Code</th>
                  <th className="pb-2 pr-4 font-medium">Description</th>
                  <th className="pb-2 pl-2 font-medium">Code</th>
                  <th className="pb-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const entries = exerciseEntries;
                  const rows: React.ReactElement[] = [];
                  for (let i = 0; i < entries.length; i += 3) {
                    const col1 = entries[i];
                    const col2 = entries[i + 1];
                    const col3 = entries[i + 2];
                    rows.push(
                      <tr key={i} className="border-b divider">
                        {/* Column 1 */}
                        <td className="py-1.5 pr-2">
                          <span className="badge badge-neutral">
                            {col1[1]}
                          </span>
                        </td>
                        <td className="py-1.5 pr-4 text-secondary">
                          {col1[0].split(' - ')[1] || col1[0]}
                        </td>
                        {/* Column 2 */}
                        {col2 && (
                          <>
                            <td className="py-1.5 pr-2 pl-2">
                              <span className="badge badge-neutral">
                                {col2[1]}
                              </span>
                            </td>
                            <td className="py-1.5 pr-4 text-secondary">
                              {col2[0].split(' - ')[1] || col2[0]}
                            </td>
                          </>
                        )}
                        {!col2 && <td className="py-1.5 pr-4"></td>}
                        {!col2 && <td className="py-1.5 pr-4"></td>}
                        {/* Column 3 */}
                        {col3 && (
                          <>
                            <td className="py-1.5 pl-2">
                              <span className="badge badge-neutral">
                                {col3[1]}
                              </span>
                            </td>
                            <td className="py-1.5 text-secondary">
                              {col3[0].split(' - ')[1] || col3[0]}
                            </td>
                          </>
                        )}
                        {!col3 && <td className="py-1.5"></td>}
                        {!col3 && <td className="py-1.5"></td>}
                      </tr>
                    );
                  }
                  return rows;
                })()}
              </tbody>
            </table>
          </div>
          {/* Mobile — simple 2-column code/description list, no horizontal scroll needed */}
          <div className="sm:hidden grid grid-cols-1 gap-1.5">
            {exerciseEntries.map(([full, code]) => (
              <div key={full} className="flex items-center gap-2 text-xs">
                <span className="badge badge-neutral flex-shrink-0">{code}</span>
                <span className="text-secondary truncate">{full.split(' - ')[1] || full}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MODALS & TOASTS */}
      {/* ============================================================ */}

      {/* Flight Detail Modal – Opens when a flight block is clicked */}
      {selectedSlot && (
        <FlightDetailModal
          slot={selectedSlot}
          onClose={handleCloseModal}
          onEdit={(flight) => {
          const sf = flight as ScheduledFlight;
          if (sf.status === 'IN_PROGRESS') {
            // ============================================================
            // CHECK-OUT FLOW: Open the Debrief Form
            // ============================================================
            // When a flight is IN_PROGRESS and user clicks "Check-Out / Debrief",
            // we open the DebriefForm to record actual times, fuel, notes.
            // On completion, it auto-creates a logbook entry.
            // ============================================================
            setDebriefFlight(sf);
            setShowDebriefForm(true);
          } else {
            // ============================================================
            // EDIT FLOW: Open the Booking Form for editing
            // ============================================================
            // When a flight is SCHEDULED and user clicks "Edit",
            // we open the BookingForm pre-filled with the flight data.
            // ============================================================
            setGridClickPrefill(null);
            setEditingFlight(sf);
            setShowBookingForm(true);
          }
        }}
        />
      )}

      {/* Booking Form Modal – Opens via "+ Book Slot", editing a flight, or
          clicking a spot on the grid (see handleGridClick) */}
      {showBookingForm && (
        <BookingForm
          onClose={() => {
            setShowBookingForm(false);
            setEditingFlight(null);
            setGridClickPrefill(null);
          }}
          onSuccess={handleBookingSuccess}
          existingFlight={editingFlight}
          prefill={gridClickPrefill}
        />
      )}

      {/* ============================================================ */}
      {/* DEBRIEF FORM MODAL */}
      {/* ============================================================ */}
      {/* Opens when user clicks "Check-Out / Debrief" on IN_PROGRESS flight */}
      {showDebriefForm && debriefFlight && (
        <DebriefForm
          flight={debriefFlight}
          onClose={() => {
            setShowDebriefForm(false);
            setDebriefFlight(null);
          }}
          onComplete={(message) => {
            setShowDebriefForm(false);
            setDebriefFlight(null);
            setSuccessMessage(message);
            // Cache already fresh — updateScheduledFlight local-splices.
            setTimeout(() => setSuccessMessage(''), 3000);
          }}
        />
      )}

      {/* Success Toast – Bottom‑right notification on successful booking */}
      {successMessage && (
        <div
          className="fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-3"
          style={{ backgroundColor: 'var(--success)', color: '#ffffff' }}
        >
          <span>{successMessage}</span>
          <button
            onClick={() => setSuccessMessage('')}
            className="font-bold opacity-80 hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Toast – Bottom‑right notification for blocked actions
          (clicking a past time slot, or an aircraft unavailable for maintenance) */}
      {errorMessage && (
        <div
          className="fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 max-w-md flex items-center gap-3"
          style={{ backgroundColor: 'var(--danger)', color: '#ffffff' }}
        >
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage('')}
            className="font-bold opacity-80 hover:opacity-100 flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
}
