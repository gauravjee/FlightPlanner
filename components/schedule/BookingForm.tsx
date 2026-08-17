// components/schedule/BookingForm.tsx
// Modal form for booking new flight slots or editing existing ones.
//
// Features:
//   - IST → UTC conversion for storage
//   - Date validation (no past dates)
//   - Minimum flight duration 45 min, in 15-min increments (45, 60, 75, ...)
//   - Turnaround buffer between flights on same aircraft: the FTO's
//     configured "Buffer Between Flights" setting (defaults to 15 min if
//     unset), +15 min mandatory refuel window if the aircraft's fuel is ≤ 50L
//   - Real‑time conflict detection with available/booked aircraft grouping
//   - Person conflict detection (student/instructor can't be double‑booked)
//   - Student medical expiry check – blocks expired students
//   - Dropdown time pickers (30‑min increments)
//   - Auto‑set end time = start + 1 hour
//   - End times before start are disabled
//   - Duration calculator
//   - Edit mode when `existingFlight` prop is provided
//   - Sortie Types: DUAL, SOLO, MAINTENANCE
//   - Exercise field (FTO-specific) – shown for DUAL & SOLO
//   - MAINTENANCE: Instructor enabled, Student & Exercise disabled
//   - SOLO: Instructor disabled, Student & Exercise required
//   - Conflict warnings shown near Instructor/Student dropdowns
//   - Aircraft fuel info displayed when aircraft selected

'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  useFlightStore, getAircraftBufferMinutes, parseTurnaroundBufferSetting,
  MIN_FLIGHT_DURATION_MIN, FLIGHT_DURATION_INCREMENT_MIN,
  LOW_FUEL_THRESHOLD_L, FUELING_BUFFER_MIN,
  getAircraftFuelBurnRate, getProjectedFuelAfter,
  getSchedulingBlockReason, parseWeeklyOffDays,
} from '@/lib/store';
import { ScheduledFlight } from '@/types';

// ============================================================
// PROPS
// ============================================================
interface Props {
  onClose: () => void;
  onSuccess: (message: string) => void;
  existingFlight?: ScheduledFlight | null;   // non‑null → edit mode
  // Set when opened by clicking a spot on the ScheduleBoard grid — seeds
  // aircraft/date/start time from where the user clicked, leaving
  // instructor/student/sortie type for them to fill in. Ignored in edit
  // mode (existingFlight takes precedence).
  prefill?: { aircraftId: string; date: string; startTime: string } | null;
}

// ============================================================
// TIME SLOTS
// ============================================================
// Time slots are no longer a fixed 06:00–22:00/30-min list — they're derived
// per-render from the FTO's own configured operating window (Settings ->
// Daily Time Slots -> fto_settings.time_slot_start / _end / _interval, minutes).
// See the TIME_SLOTS useMemo inside the component. These are just the
// fallback defaults used until that setting has loaded (or if it's missing).
const DEFAULT_SLOT_START = '06:00';
const DEFAULT_SLOT_END = '22:00';
const DEFAULT_SLOT_INTERVAL_MIN = 30;

const todayLocal = new Date().toLocaleDateString('en-CA');   // local date in YYYY-MM-DD

// Zero-pad a number to 2 digits, e.g. 6 -> "06".
const pad2 = (n: number): string => String(n).padStart(2, '0');

// ============================================================
// FTO EXERCISE LIST
// ============================================================
const EXERCISES = [
  '120NM - 120NM Xcty Check',
  '250NM - 250NM Xcty Check',
  '300NM - 300 Nm Cross-Country',
  'AIREX - Air Experience',
  'C&D - Climb & Descend',
  'CCTS - Circuits & Landings',
  'CHK - Check',
  'CRTV - Corrective',
  'CT&DT - Climbing turn & Descending turn',
  'EMGCY - Emergencies',
  'EOC - Effect of Controls',
  'FAM - Familiarisation',
  'GF - General Flying',
  'GFT.D - General Flying Test DAY',
  'GFT.N - General Flying Test NIGHT',
  'IF - Instrument Flying',
  'IRT - Instrument Rating Test',
  'PC - Progress Check',
  'PPC - Pilot Proficiency Check',
  'RRT - Recurrent Training',
  'S&L - Straight & Level',
  'SIDE/FRDW SLIP - SLIP',
  'ST.TRN - Steep Turns',
  'ST&RE - Stall & Recovery',
  'TO & Climb - TO & Climb',
  'TRN - Turns',
  'X-CTY - Cross-Country',
];

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function BookingForm({ onClose, onSuccess, existingFlight, prefill }: Props) {

  // ----- Store -----
  const {
    aircraft, students, instructors, scheduledFlights,
    bookFlight, loadAircraft, loadStudents, loadScheduledFlights,
    updateScheduledFlight,
    loadTrainingRequirements,
    getRequirementsForStudent,
    ftoSettings, loadFTOSettings,
    holidays, loadHolidays,
  } = useFlightStore();

  // ----- Initial data load -----
  useEffect(() => {
    if (aircraft.length === 0) loadAircraft();
    if (students.length === 0) loadStudents();
    if (Object.keys(ftoSettings).length === 0) loadFTOSettings();
    if (holidays.length === 0) loadHolidays();
    loadScheduledFlights();
  }, []);

  // FTO-wide blackout days — weekly recurring off day(s) (Settings -> Time &
  // Scheduling -> "Weekly Off Day(s)") parsed from the raw comma-separated
  // fto_settings value.
  const weeklyOffDays = parseWeeklyOffDays(ftoSettings['weekly_off_days']);

  // ----- Daily operating window & slot granularity, from FTO Settings -----
  // (Settings -> Daily Time Slots). Falls back to the previous hardcoded
  // 06:00-22:00/30-min defaults until the setting has loaded, or if it's
  // missing/unset. `ftoSettings` is a subscribed store field, so this
  // recomputes (and TIME_SLOTS/HOUR_OPTIONS below with it) once the async
  // load resolves — no stale defaults baked in permanently.
  const slotStart = ftoSettings['time_slot_start'] || DEFAULT_SLOT_START;
  const slotEnd = ftoSettings['time_slot_end'] || DEFAULT_SLOT_END;
  const slotIntervalMin = parseInt(ftoSettings['time_slot_interval'], 10) || DEFAULT_SLOT_INTERVAL_MIN;

  // Required turnaround gap between flights on the same aircraft (Settings
  // -> Time & Scheduling -> "Buffer Between Flights"); low-fuel aircraft get
  // an additional mandatory refuel window on top of this — see
  // getAircraftBufferMinutes.
  const turnaroundMin = parseTurnaroundBufferSetting(ftoSettings['buffer_minutes']);

  // ----- Default times (next full hour) -----
  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setHours(now.getHours() + 1, 0, 0, 0);
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setHours(defaultStart.getHours() + 2);

  // Helper to format a Date to HH:MM (rounded to nearest 30 min) — only used
  // for the two "next full hour" defaults above, which always land on an
  // exact hour (0 minutes), so this rounding is a no-op regardless of the
  // configured interval.
  const formatTime = (date: Date): string => {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes() >= 30 ? '30' : '00';
    return `${h}:${m}`;
  };

  // Snap an arbitrary Date to the nearest valid slot boundary for the
  // configured interval (e.g. interval=15 -> :00/:15/:30/:45). Used wherever
  // a real timestamp (an existing flight's stored time, or start+duration)
  // needs to land on a value the Hour/Minute dropdowns can actually select.
  const snapToInterval = (date: Date, intervalMin: number): string => {
    let totalMin = Math.round((date.getHours() * 60 + date.getMinutes()) / intervalMin) * intervalMin;
    totalMin = ((totalMin % 1440) + 1440) % 1440; // wrap into [0, 1440)
    return `${pad2(Math.floor(totalMin / 60))}:${pad2(totalMin % 60)}`;
  };

  // Helper to add hours to a time string, snapped to the configured interval
  const addHoursToTime = (timeStr: string, hoursToAdd: number): string => {
    const [h, m] = timeStr.split(':').map(Number);
    const totalMinutes = h * 60 + m + hoursToAdd * 60;
    const snapped = Math.round(totalMinutes / slotIntervalMin) * slotIntervalMin;
    const newH = Math.floor(snapped / 60) % 24;
    const newM = snapped % 60;
    return `${pad2(newH)}:${pad2(newM)}`;
  };

  // ----- Selectable time slots for this FTO's configured operating window -----
  const TIME_SLOTS = useMemo(() => {
    const [startH, startM] = slotStart.split(':').map(Number);
    const [endH, endM] = slotEnd.split(':').map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;
    const slots: { value: string; label: string; hour: number; minute: number }[] = [];
    if (Number.isFinite(startTotal) && Number.isFinite(endTotal) && endTotal > startTotal && slotIntervalMin > 0) {
      for (let t = startTotal; t <= endTotal; t += slotIntervalMin) {
        const h = Math.floor(t / 60);
        const m = t % 60;
        slots.push({ value: `${pad2(h)}:${pad2(m)}`, label: `${pad2(h)}:${pad2(m)} IST`, hour: h, minute: m });
      }
    }
    return slots;
  }, [slotStart, slotEnd, slotIntervalMin]);

  // Unique hour values available across the whole window (for the Hour
  // dropdown — up to 24 of them, but in practice bounded by time_slot_start
  // / time_slot_end, e.g. 06 through 22 for a typical daytime-only FTO).
  const HOUR_OPTIONS = useMemo(
    () => Array.from(new Set(TIME_SLOTS.map(s => s.hour))),
    [TIME_SLOTS]
  );

  // Valid minute values for a given hour (depends on where that hour falls
  // relative to the configured start/end — the first and last hour in the
  // window may only offer a subset of the interval's usual minute marks).
  const getMinutesForHour = (hour: number): number[] =>
    TIME_SLOTS.filter(s => s.hour === hour).map(s => s.minute);

  // Format a Date to plain HH:MM (no rounding — used for the "earliest
  // bookable time" cutoff, which lands on a quarter-hour, not a half-hour).
  const formatHHMM = (date: Date): string =>
    `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

  // Earliest a NEW booking's start time may be: "now" rounded UP to the next
  // quarter-hour mark (16:58 -> 17:15, 17:00:00 exactly -> 17:00). Bookings
  // for a future date have no time-of-day restriction — this only matters
  // when the selected date is today.
  const getMinBookableTime = (): Date => {
    const now = new Date();
    const min = new Date(now);
    min.setSeconds(0, 0);
    const remainder = min.getMinutes() % 15;
    if (remainder !== 0 || now.getSeconds() > 0 || now.getMilliseconds() > 0) {
      min.setMinutes(min.getMinutes() - remainder + 15);
    }
    return min;
  };

  // ----- Form state -----
  // Lazy initializer so a grid-click prefill (aircraft/date/start time) is
  // baked into the very first render instead of being patched in via an
  // effect afterward — BookingForm gets a fresh mount each time it's
  // opened (see ScheduleBoard), so this always sees the right prefill.
  // Edit mode (existingFlight) is unaffected — that's handled by the effect
  // below, same as before.
  const [form, setForm] = useState(() => {
    if (prefill) {
      return {
        aircraftId: prefill.aircraftId,
        instructorId: '',
        studentId: '',
        date: prefill.date,
        startTime: prefill.startTime,
        endTime: addHoursToTime(prefill.startTime, 1),
        sortieType: 'DUAL',
        exercise: '',
        notes: '',
      };
    }
    return {
      aircraftId: '',
      instructorId: '',
      studentId: '',
      date: todayLocal,
      startTime: formatTime(defaultStart),
      endTime: formatTime(defaultEnd),
      sortieType: 'DUAL',          // DUAL | SOLO | MAINTENANCE
      exercise: '',                 // Exercise code (for DUAL & SOLO only)
      notes: '',
    };
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [conflictWarning, setConflictWarning] = useState('');

  // ----- Populate form when editing an existing flight -----
  useEffect(() => {
    if (existingFlight) {
      const startDate = new Date(existingFlight.startTime);
      const endDate = new Date(existingFlight.endTime);
      setForm({
        aircraftId: existingFlight.aircraftId,
        instructorId: existingFlight.instructorId || '',
        studentId: existingFlight.studentId || '',
        date: startDate.toLocaleDateString('en-CA'),
        // Snapped to the current interval so the Hour/Minute dropdowns below
        // always have a matching option, even if this flight was originally
        // booked under a different (e.g. finer) interval setting.
        startTime: snapToInterval(startDate, slotIntervalMin),
        endTime: snapToInterval(endDate, slotIntervalMin),
        sortieType: existingFlight.sortieType || 'DUAL',
        exercise: (existingFlight as any).exercise || '',
        notes: existingFlight.notes || '',
      });
    }
  }, [existingFlight, slotIntervalMin]);

  // ============================================================
  // DERIVED STATE
  // ============================================================

  // Sortie type helpers
  const isDual = form.sortieType === 'DUAL';
  const isSolo = form.sortieType === 'SOLO';
  const isMaintenance = form.sortieType === 'MAINTENANCE';

  // Clear instructor when switching to Solo
  useEffect(() => {
    if (isSolo && form.instructorId) {
      setForm(prev => ({ ...prev, instructorId: '' }));
    }
  }, [isSolo]);

  // Clear student when switching to Maintenance
  useEffect(() => {
    if (isMaintenance && form.studentId) {
      setForm(prev => ({ ...prev, studentId: '' }));
    }
  }, [isMaintenance]);

  // Clear exercise when switching to Maintenance
  useEffect(() => {
    if (isMaintenance && form.exercise) {
      setForm(prev => ({ ...prev, exercise: '' }));
    }
  }, [isMaintenance]);

  // Selected aircraft object for fuel display
  const selectedAircraft = aircraft.find(a => String(a.id) === String(form.aircraftId));

  // Estimated fuel remaining at the end of THIS booking, from the selected
  // aircraft's current fuel level and its (per-aircraft, else per-type)
  // burn rate — a planning estimate only, not a certified fuel calculation.
  // null until a valid aircraft + duration are selected.
  const durationMinForFuelEstimate = (() => {
    if (!form.startTime || !form.endTime) return 0;
    const [sh, sm] = form.startTime.split(':').map(Number);
    const [eh, em] = form.endTime.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    return mins > 0 ? mins : 0;
  })();
  const estimatedFuelAfter = selectedAircraft && durationMinForFuelEstimate > 0
    ? getProjectedFuelAfter(selectedAircraft, durationMinForFuelEstimate)
    : null;

  // ============================================================
  // VALIDATION FUNCTIONS
  // ============================================================

  // Date must not be in the past, and must not fall on a holiday or the
  // FTO's weekly off day.
  const validateDate = (dateStr: string): string => {
    const selected = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selected < today) return '❌ Cannot book flights in the past.';
    const blockReason = getSchedulingBlockReason(dateStr, holidays, weeklyOffDays);
    if (blockReason) return `❌ FTO is closed (${blockReason.label}) — cannot book flights on this date.`;
    return '';
  };

  // End time must be after start time; duration must be at least
  // MIN_FLIGHT_DURATION_MIN and land on a FLIGHT_DURATION_INCREMENT_MIN step
  // (45, 60, 75, 90 minutes, ...).
  const validateTimes = (startTime: string, endTime: string): string => {
    if (!startTime || !endTime) return '';
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const durationMin = (eh * 60 + em) - (sh * 60 + sm);
    if (durationMin <= 0) return '❌ End time must be after start time.';
    if (durationMin < MIN_FLIGHT_DURATION_MIN) return `❌ Minimum flight duration is ${MIN_FLIGHT_DURATION_MIN} minutes.`;
    if (durationMin % FLIGHT_DURATION_INCREMENT_MIN !== 0) {
      return `❌ Flight duration must be in ${FLIGHT_DURATION_INCREMENT_MIN}-minute increments (e.g. ${MIN_FLIGHT_DURATION_MIN}, ${MIN_FLIGHT_DURATION_MIN + FLIGHT_DURATION_INCREMENT_MIN}, ${MIN_FLIGHT_DURATION_MIN + FLIGHT_DURATION_INCREMENT_MIN * 2} min).`;
    }
    return '';
  };

  // Start time must be at or after the earliest bookable time (for today's
  // date) — "now" rounded up to the next quarter-hour, not simply "any time
  // after right now" (which would let someone pick a start time only
  // seconds away and have it be stale by the time they hit Submit).
  const validateNotPast = (dateStr: string, timeStr: string): string => {
    const selected = new Date(`${dateStr}T${timeStr}:00`);
    const minAllowed = getMinBookableTime();
    if (selected < minAllowed) {
      return `❌ Earliest bookable time today is ${formatHHMM(minAllowed)}. Please pick a later time.`;
    }
    return '';
  };

  // Student must have a valid medical
  const validateStudentMedical = (studentId: string): string => {
    if (!studentId || isMaintenance) return '';
    const student = students.find(s => s.id === studentId);
    if (!student || !student.medicalExpiry) return '';
    const medicalDate = new Date(student.medicalExpiry);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (medicalDate < today) {
      return `❌ ${student.name}'s medical expired on ${student.medicalExpiry}. Cannot book flight.`;
    }
    return '';
  };

  // ============================================================
  // CONFLICT DETECTION
  // ============================================================

  // Aircraft conflict – buffer is per-aircraft (each existing flight's own
  // aircraft's turnaround/fueling gap, from its current fuel level), not a
  // flat 30 minutes. Same rule the store's checkConflicts() applies at
  // actual booking time, so this list of "already booked" aircraft always
  // matches what submitting the form would actually allow.
  const getBookedAircraftIds = useMemo((): string[] => {
    if (!form.date || !form.startTime || !form.endTime) return [];
    const slotStart = new Date(`${form.date}T${form.startTime}:00+05:30`);
    const slotEnd = new Date(`${form.date}T${form.endTime}:00+05:30`);
    return scheduledFlights
      .filter(flight => {
        if (existingFlight && flight.id === existingFlight.id) return false;
        const flightAircraft = aircraft.find(a => String(a.id) === String(flight.aircraftId));
        // Asymmetric: the gap before THAT flight is based on the aircraft's
        // current fuel (best info we have for "back then"); the gap after it
        // is based on the fuel projected at the end of that flight's own
        // duration — same logic the store's checkConflicts() applies.
        const flightDurationMin = Math.round(
          (new Date(flight.endTime).getTime() - new Date(flight.startTime).getTime()) / 60000
        );
        const bufferBeforeMin = getAircraftBufferMinutes(flightAircraft?.currentFuel, turnaroundMin);
        const projectedFuelAfter = getProjectedFuelAfter(flightAircraft, flightDurationMin);
        const bufferAfterMin = getAircraftBufferMinutes(projectedFuelAfter, turnaroundMin);
        const bufferedStart = new Date(flight.startTime); bufferedStart.setMinutes(bufferedStart.getMinutes() - bufferBeforeMin);
        const bufferedEnd = new Date(flight.endTime); bufferedEnd.setMinutes(bufferedEnd.getMinutes() + bufferAfterMin);
        return slotStart < bufferedEnd && slotEnd > bufferedStart;
      })
      .map(flight => flight.aircraftId);
  }, [form.date, form.startTime, form.endTime, scheduledFlights, existingFlight, aircraft, turnaroundMin]);

  const availableAircraft = useMemo(
    () => aircraft.filter(ac => ac.status === 'ACTIVE' && !getBookedAircraftIds.includes(String(ac.id))),
    [aircraft, getBookedAircraftIds]
  );

  const bookedAircraft = useMemo(
    () => aircraft.filter(ac => ac.status === 'ACTIVE' && getBookedAircraftIds.includes(String(ac.id))),
    [aircraft, getBookedAircraftIds]
  );

  // Person conflict check (student or instructor already booked at this time)
  const checkPersonConflict = (): string => {
    if (!form.date || !form.startTime || !form.endTime) return '';
    const slotStart = new Date(`${form.date}T${form.startTime}:00+05:30`);
    const slotEnd = new Date(`${form.date}T${form.endTime}:00+05:30`);
    // Student conflict (not for maintenance)
    if (form.studentId && !isMaintenance) {
      const conflict = scheduledFlights.some(flight => {
        if (existingFlight && flight.id === existingFlight.id) return false;
        if (flight.studentId !== form.studentId) return false;
        const fs = new Date(flight.startTime); const fe = new Date(flight.endTime);
        return fs < slotEnd && fe > slotStart;
      });
      if (conflict) return `❌ This student is already booked at this time.`;
    }
    // Instructor conflict (not for solo)
    if (form.instructorId && !isSolo) {
      const conflict = scheduledFlights.some(flight => {
        if (existingFlight && flight.id === existingFlight.id) return false;
        if (flight.instructorId !== form.instructorId) return false;
        const fs = new Date(flight.startTime); const fe = new Date(flight.endTime);
        return fs < slotEnd && fe > slotStart;
      });
      if (conflict) return `❌ This instructor is already booked at this time.`;
    }
    return '';
  };

  // ============================================================
  // FIELD CHANGE HANDLER
  // ============================================================
  const handleFieldChange = (field: string, value: string) => {
    setError('');
    setConflictWarning('');
    setForm(prev => {
      const updated = { ...prev, [field]: value };

      // Auto‑set end time = start + 1 hour when start time changes
      if (field === 'startTime' && value) {
        updated.endTime = addHoursToTime(value, 1);
      }

      // Clear exercise when switching to Maintenance
      if (field === 'sortieType' && value === 'MAINTENANCE') {
        updated.exercise = '';
      }

      // Validate date/time
      if (field === 'date' || field === 'startTime' || field === 'endTime') {
        if (field === 'date') { const e = validateDate(value); if (e) setError(e); }
        const startT = updated.startTime;
        const endT = updated.endTime;
        const e = validateTimes(startT, endT); if (e) setError(e);
        if (updated.date && updated.startTime) {
          const pe = validateNotPast(updated.date, updated.startTime);
          if (pe) setError(pe);
        }
      }

      // Check medical expiry when student changes
      if (field === 'studentId' && value) {
        const medError = validateStudentMedical(value);
        if (medError) setError(medError);
      }

      // Default Instructor to this student's assigned instructor (still
      // changeable below) — same pattern as FlightRecordForm's Log Flight.
      // Only defaults when the student actually has a valid assigned
      // instructor; otherwise leaves whatever instructor was already picked.
      // Harmless in Solo mode too — the instructor field is disabled there
      // and the submit handler forces instructorId to '' regardless.
      if (field === 'studentId' && value) {
        const student = students.find(s => s.id === value);
        const assignedIsValid = student?.assignedInstructorId
          && instructors.some(i => i.id === student.assignedInstructorId);
        if (assignedIsValid) {
          updated.instructorId = student!.assignedInstructorId!;
        }
      }

      return updated;
    });
  };

  // ============================================================
  // SUBMIT HANDLER
  // ============================================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Required field checks
    if (!form.aircraftId) { setError('❌ Please select an aircraft.'); return; }
    if (!isSolo && !form.instructorId) { setError('❌ Please select an instructor.'); return; }
    if (!isMaintenance && !form.studentId) { setError('❌ Please select a student.'); return; }
    if (!isMaintenance && !form.exercise) { setError('❌ Please select an exercise.'); return; }

    // Date/time validation
    const d = validateDate(form.date); if (d) { setError(d); return; }
    const t = validateTimes(form.startTime, form.endTime); if (t) { setError(t); return; }
    const p = validateNotPast(form.date, form.startTime); if (p) { setError(p); return; }

    // Student medical check
    if (!isMaintenance) {
      const med = validateStudentMedical(form.studentId); if (med) { setError(med); return; }
    }

    // Person conflict check
    const personConflict = checkPersonConflict(); if (personConflict) { setError(personConflict); return; }

    setLoading(true);

    // ===== CHECK STUDENT REQUIREMENTS =====
    // Two layers, both against the same freshly-loaded requirements list:
    //   1. The two specific checks that already existed here (SPL for any
    //      flight, FRTOL(R) for solo), kept by name match so this doesn't
    //      silently stop enforcing them if those particular requirement
    //      templates don't (yet) have blocksAllFlights/blocksSolo ticked
    //      in Admin Setup -> Requirements.
    //   2. A generic check across every requirement: any incomplete
    //      requirement flagged blocksAllFlights blocks every sortie type;
    //      blocksSolo additionally blocks SOLO specifically. This is what
    //      makes the Lock flags configured on the Requirements tab (fully
    //      modeled in the DB/UI, but never actually enforced anywhere
    //      until now) actually stop a booking — for any requirement an
    //      admin marks blocking, not just these two hardcoded ones.
    // Every early return below must setLoading(false) first — this runs
    // after the setLoading(true) above, unlike the validation checks
    // earlier in this handler.
    if (!isMaintenance && form.studentId) {
      await loadTrainingRequirements(form.studentId);
      const studentReqs = getRequirementsForStudent(form.studentId);

      const spl = studentReqs.find(r =>
        r.requirementName.includes('Student Pilot License')
      );
      if (spl && !spl.isCompleted) {
        setError('❌ Student cannot fly without a valid Student Pilot License (SPL).');
        setLoading(false);
        return;
      }

      if (isSolo) {
        const frtol = studentReqs.find(r =>
          r.requirementName.includes('FRTOL(R)')
        );
        if (frtol && !frtol.isCompleted) {
          setError('❌ Student cannot fly solo without a valid FRTOL(R).');
          setLoading(false);
          return;
        }
      }

      const blockingAllFlights = studentReqs.find(r => r.blocksAllFlights && !r.isCompleted);
      if (blockingAllFlights) {
        setError(`❌ Student cannot fly until "${blockingAllFlights.requirementName}" is completed.`);
        setLoading(false);
        return;
      }

      if (isSolo) {
        const blockingSolo = studentReqs.find(r => r.blocksSolo && !r.isCompleted);
        if (blockingSolo) {
          setError(`❌ Student cannot fly solo until "${blockingSolo.requirementName}" is completed.`);
          setLoading(false);
          return;
        }
      }
    }

    // Convert IST → UTC
    const startIST = new Date(`${form.date}T${form.startTime}:00+05:30`);
    const endIST = new Date(`${form.date}T${form.endTime}:00+05:30`);

    if (existingFlight) {
      await updateScheduledFlight(existingFlight.id, {
        aircraftId: form.aircraftId,
        instructorId: isSolo ? '' : form.instructorId,
        studentId: isMaintenance ? undefined : form.studentId,
        startTime: startIST.toISOString(),
        endTime: endIST.toISOString(),
        sortieType: form.sortieType,
        exercise: isMaintenance ? '' : form.exercise,
        notes: form.notes,
      });
      onSuccess('✅ Flight updated!');
      onClose();
    } else {
      const result = await bookFlight({
        aircraftId: form.aircraftId,
        instructorId: isSolo ? '' : form.instructorId,
        studentId: isMaintenance ? undefined : form.studentId,
        startTime: startIST.toISOString(),
        endTime: endIST.toISOString(),
        sortieType: form.sortieType,
        exercise: isMaintenance ? '' : form.exercise,
        notes: form.notes,
        status: 'SCHEDULED',           
        weatherBriefed: false,         
        notamBriefed: false,           
      });
      setLoading(false);
      if (result.success) { onSuccess(result.message); } else { setError(result.message); }
    }
  };

  // ============================================================
  // DURATION HELPER
  // ============================================================
  const getDuration = (): string => {
    if (!form.startTime || !form.endTime) return '--';
    const [sh, sm] = form.startTime.split(':').map(Number);
    const [eh, em] = form.endTime.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins <= 0) return '--';
    return `${Math.floor(mins / 60)}h${mins % 60 > 0 ? ` ${mins % 60}m` : ''}`;
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* ===== HEADER ===== */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700 sticky top-0 bg-slate-800 z-10 rounded-t-xl">
          <h3 className="text-lg font-semibold text-white">
            {existingFlight ? '✏️ Edit Flight' : '📅 Book Flight Slot'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg cursor-pointer">
            <span className="text-slate-400 text-xl">✕</span>
          </button>
        </div>

        {/* ===== FORM ===== */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">

          {/* Error message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Conflict warning */}
          {conflictWarning && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-sm text-yellow-400">{conflictWarning}</p>
            </div>
          )}

          {/* ===== DATE ===== */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">📅 Date *</label>
            <input
              type="date"
              value={form.date}
              onChange={e => handleFieldChange('date', e.target.value)}
              min={todayLocal}
              required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
            />
            <p className="text-xs text-slate-500 mt-1">All times are in IST (Indian Standard Time, UTC+5:30)</p>
          </div>

          {/* ===== START & END TIME ===== */}
          {/* Separate Hour / Minute dropdowns rather than one combined
              HH:MM list — the Hour options come from the FTO's configured
              operating window (up to all 24, in practice bounded by
              time_slot_start/time_slot_end) and the Minute options come
              from time_slot_interval, both from Settings -> Daily Time Slots. */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">🕐 Start Time *</label>
              <div className="flex gap-2">
                {(() => {
                  const [startHour, startMinute] = form.startTime.split(':').map(Number);
                  const minutesForStartHour = getMinutesForHour(startHour);
                  return (
                    <>
                      <select
                        value={pad2(startHour)}
                        onChange={e => {
                          const hour = parseInt(e.target.value, 10);
                          const valid = getMinutesForHour(hour);
                          const minute = valid.includes(startMinute) ? startMinute : (valid[0] ?? 0);
                          handleFieldChange('startTime', `${pad2(hour)}:${pad2(minute)}`);
                        }}
                        required
                        className="w-1/2 bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-white">
                        {HOUR_OPTIONS.map(h => {
                          // Only today's date has a "too early" cutoff — future
                          // dates have no time-of-day restriction. An hour is
                          // disabled only when EVERY minute in it is past.
                          const isPast = form.date === todayLocal
                            && getMinutesForHour(h).every(m => new Date(`${form.date}T${pad2(h)}:${pad2(m)}:00`) < getMinBookableTime());
                          return <option key={h} value={pad2(h)} disabled={isPast}>{pad2(h)}</option>;
                        })}
                      </select>
                      <select
                        value={pad2(minutesForStartHour.includes(startMinute) ? startMinute : (minutesForStartHour[0] ?? 0))}
                        onChange={e => handleFieldChange('startTime', `${pad2(startHour)}:${e.target.value}`)}
                        required
                        className="w-1/2 bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-white">
                        {minutesForStartHour.map(m => {
                          const isPast = form.date === todayLocal
                            && new Date(`${form.date}T${pad2(startHour)}:${pad2(m)}:00`) < getMinBookableTime();
                          return <option key={m} value={pad2(m)} disabled={isPast}>{pad2(m)}</option>;
                        })}
                      </select>
                    </>
                  );
                })()}
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">🕑 End Time *</label>
              <div className="flex gap-2">
                {(() => {
                  const [startHour, startMinute] = (form.startTime || slotStart).split(':').map(Number);
                  const startTotal = startHour * 60 + startMinute;
                  const [endHour, endMinute] = form.endTime.split(':').map(Number);
                  const minutesForEndHour = getMinutesForHour(endHour);
                  return (
                    <>
                      <select
                        value={pad2(endHour)}
                        onChange={e => {
                          const hour = parseInt(e.target.value, 10);
                          const valid = getMinutesForHour(hour);
                          const minute = valid.includes(endMinute) ? endMinute : (valid[0] ?? 0);
                          handleFieldChange('endTime', `${pad2(hour)}:${pad2(minute)}`);
                        }}
                        required
                        className="w-1/2 bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-white">
                        {HOUR_OPTIONS.map(h => {
                          // An hour is disabled only when EVERY minute in it
                          // is at or before the selected start time.
                          const isBeforeStart = getMinutesForHour(h).every(m => (h * 60 + m) <= startTotal);
                          return <option key={h} value={pad2(h)} disabled={isBeforeStart}>{pad2(h)}</option>;
                        })}
                      </select>
                      <select
                        value={pad2(minutesForEndHour.includes(endMinute) ? endMinute : (minutesForEndHour[0] ?? 0))}
                        onChange={e => handleFieldChange('endTime', `${pad2(endHour)}:${e.target.value}`)}
                        required
                        className="w-1/2 bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-white">
                        {minutesForEndHour.map(m => {
                          const isBeforeStart = (endHour * 60 + m) <= startTotal;
                          return <option key={m} value={pad2(m)} disabled={isBeforeStart}>{pad2(m)}</option>;
                        })}
                      </select>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-500 -mt-2">
            Bookable window: {slotStart}–{slotEnd} IST, {slotIntervalMin}-minute start times. Flights must be at least {MIN_FLIGHT_DURATION_MIN} min, in {FLIGHT_DURATION_INCREMENT_MIN}-min increments.
          </p>

          {/* ===== DURATION ===== */}
          {form.startTime && form.endTime && getDuration() !== '--' && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 text-center">
              <p className="text-sm text-blue-400">⏱ Duration: <span className="font-bold">{getDuration()}</span></p>
            </div>
          )}

          {/* ===== AIRCRAFT ===== */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              🛩️ Aircraft *
              {form.date && form.startTime && form.endTime && (
                <span className="text-xs text-green-400 ml-1">({availableAircraft.length} available)</span>
              )}
            </label>
            <select value={form.aircraftId} onChange={e => handleFieldChange('aircraftId', e.target.value)} required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
              <option value="">Select Aircraft</option>
              {availableAircraft.length > 0 && (
                <optgroup label="✅ AVAILABLE">
                  {availableAircraft.map(a => <option key={a.id} value={a.id}>{a.registration} ({a.type}) — {a.currentFuel}L</option>)}
                </optgroup>
              )}
              {bookedAircraft.length > 0 && (
                <optgroup label="🔴 ALREADY BOOKED">
                  {bookedAircraft.map(a => <option key={a.id} value={a.id} disabled className="text-red-400">{a.registration} ({a.type}) — BOOKED</option>)}
                </optgroup>
              )}
            </select>
            {bookedAircraft.length > 0 && (
              <p className="text-xs text-yellow-400 mt-1">
                🔴 {bookedAircraft.length} aircraft booked ({turnaroundMin}-min turnaround, +{FUELING_BUFFER_MIN} min if fuel ≤ {LOW_FUEL_THRESHOLD_L}L)
              </p>
            )}
          </div>

          {/* ===== STUDENT ===== */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              👨‍✈️ Student {!isMaintenance && '*'}
            </label>
            <select
              value={isMaintenance ? '' : form.studentId}
              onChange={e => handleFieldChange('studentId', e.target.value)}
              disabled={isMaintenance}
              required={!isMaintenance}
              className={`w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white ${isMaintenance ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <option value="">{isMaintenance ? 'N/A – Maintenance Flight' : 'Select Student'}</option>
              {!isMaintenance && students.filter(s => s.status === 'ACTIVE').map(s => {
                const medicalDate = s.medicalExpiry ? new Date(s.medicalExpiry) : null;
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const isExpired = medicalDate && medicalDate < today;
                return (
                  <option key={s.id} value={s.id} disabled={!!isExpired}>
                    {s.name} ({s.initials}) — {s.trainingStage} | {s.totalHours}h{isExpired ? ' ⚠️ MEDICAL EXPIRED' : ''}
                  </option>
                );
              })}
            </select>
            {/* Student conflict warning */}
            {form.studentId && !isMaintenance && checkPersonConflict().includes('student') && (
              <p className="text-xs text-red-400 mt-1">⚠️ This student is already booked at this time</p>
            )}
          </div>

          {/* ===== INSTRUCTOR ===== */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              👨‍🏫 Instructor {!isSolo && '*'}
            </label>
            <select
              value={isSolo ? '' : form.instructorId}
              onChange={e => handleFieldChange('instructorId', e.target.value)}
              required={!isSolo}
              disabled={isSolo}
              className={`w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white ${isSolo ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <option value="">
                {isSolo ? 'N/A – Solo Flight' : 'Select Instructor'}
              </option>
              {!isSolo && instructors.map(i => <option key={i.id} value={i.id}>{i.name} ({i.initials})</option>)}
            </select>
            {/* Instructor conflict warning */}
            {form.instructorId && !isSolo && checkPersonConflict().includes('instructor') && (
              <p className="text-xs text-red-400 mt-1">⚠️ This instructor is already booked at this time</p>
            )}
          </div>

          {/* ===== SORTIE TYPE ===== */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">🎯 Sortie Type</label>
            <select value={form.sortieType} onChange={e => handleFieldChange('sortieType', e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
              <option value="DUAL">Dual</option>
              <option value="SOLO">Solo</option>
              <option value="MAINTENANCE">Maintenance Flight</option>
            </select>
          </div>

          {/* ===== EXERCISE (Dual & Solo only) ===== */}
          {!isMaintenance && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">📋 Exercise *</label>
              <select value={form.exercise} onChange={e => handleFieldChange('exercise', e.target.value)}
                required={!isMaintenance}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
                <option value="">Select Exercise</option>
                {EXERCISES.map(ex => <option key={ex} value={ex}>{ex}</option>)}
              </select>
            </div>
          )}

          {/* ===== AIRCRAFT FUEL INFO (Current Fuel Level + Estimated Landing Fuel) ===== */}
          {selectedAircraft && (
            <div className="bg-slate-700/50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-400">Current Fuel Level</p>
              <p className="text-2xl font-bold text-white">{selectedAircraft.currentFuel}L</p>
              <p className="text-xs text-slate-500">Capacity: {selectedAircraft.fuelCapacity}L</p>
              {estimatedFuelAfter !== null && (
                <p className="text-xs text-slate-400 mt-2">
                  ⛽ Est. fuel at landing: <span className="font-semibold text-white">~{Math.round(estimatedFuelAfter)}L</span>
                  {' '}<span className="text-slate-500">
                    (~{getAircraftFuelBurnRate(selectedAircraft)} L/hr avg for {selectedAircraft.type}
                    {selectedAircraft.fuelBurnRateLph != null ? '' : ', type default'} — planning estimate only, verify against actual)
                  </span>
                </p>
              )}
              {selectedAircraft.currentFuel <= LOW_FUEL_THRESHOLD_L && (
                <p className="text-xs text-yellow-400 mt-1">
                  ⛽ Fuel at or below {LOW_FUEL_THRESHOLD_L}L — a mandatory {FUELING_BUFFER_MIN}-min refuel window is required before/after this flight.
                </p>
              )}
              {estimatedFuelAfter !== null && estimatedFuelAfter <= LOW_FUEL_THRESHOLD_L && selectedAircraft.currentFuel > LOW_FUEL_THRESHOLD_L && (
                <p className="text-xs text-yellow-400 mt-1">
                  ⛽ Projected to land at or below {LOW_FUEL_THRESHOLD_L}L — a mandatory {FUELING_BUFFER_MIN}-min refuel window will be required after this flight.
                </p>
              )}
            </div>
          )}

          {/* ===== NOTES ===== */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">📝 Notes</label>
            <textarea value={form.notes} onChange={e => handleFieldChange('notes', e.target.value)}
              rows={2} placeholder="Any special instructions…"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white" />
          </div>

          {/* ===== BUTTONS ===== */}
          <div className="flex space-x-3 pt-4 border-t border-slate-700">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition cursor-pointer font-bold disabled:opacity-50">
              {loading ? 'Saving…' : existingFlight ? '💾 Update Flight' : '📅 Book Flight'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}