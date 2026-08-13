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

import React, { useState, useEffect } from 'react';
import { useFlightStore } from '@/lib/store';
import { getLocationDisplay } from '@/lib/location';
import { FlightSlot, ScheduledFlight } from '@/types';
import FlightDetailModal from './FlightDetailModal';
import BookingForm from './BookingForm';
import DebriefForm from './DebriefForm';


// ============================================================
// CONSTANTS – Sortie type colors and labels (used for legend)
// ============================================================
const SORTIE_COLORS: Record<string, string> = {
  DUAL: 'bg-blue-600/80 border-blue-400',
  SOLO: 'bg-green-600/80 border-green-400',
  MAINTENANCE: 'bg-yellow-500/80 border-yellow-400',
};


const SORTIE_LABELS: Record<string, string> = {
  DUAL: 'Dual',
  SOLO: 'Solo',
  MAINTENANCE: 'Maintenance',
};

// ============================================================
// EXERCISE SHORT CODES – maps full exercise names to short codes
// ============================================================
const EXERCISE_SHORT_CODES: Record<string, string> = {
  '120NM - 120NM Xcty Check': '120NM',
  '250NM - 250NM Xcty Check': '250NM',
  '300NM - 300 Nm Cross-Country': '300NM',
  'AIREX - Air Experience': 'AIREX',
  'C&D - Climb & Descend': 'C&D',
  'CCTS - Circuits & Landings': 'CCTS',
  'CHK - Check': 'CHK',
  'CRTV - Corrective': 'CRTV',
  'CT&DT - Climbing turn & Descending turn': 'CT&DT',
  'EMGCY - Emergencies': 'EMGCY',
  'EOC - Effect of Controls': 'EOC',
  'FAM - Familiarisation': 'FAM',
  'GF - General Flying': 'GF',
  'GFT.D - General Flying Test DAY': 'GFT.D',
  'GFT.N - General Flying Test NIGHT': 'GFT.N',
  'IF - Instrument Flying': 'IF',
  'IRT - Instrument Rating Test': 'IRT',
  'PC - Progress Check': 'PC',
  'PPC - Pilot Proficiency Check': 'PPC',
  'RRT - Recurrent Training': 'RRT',
  'S&L - Straight & Level': 'S&L',
  'SIDE/FRDW SLIP - SLIP': 'SLIP',
  'ST.TRN - Steep Turns': 'ST.TRN',
  'ST&RE - Stall & Recovery': 'ST&RE',
  'TO & Climb - TO & Climb': 'TO_CLB',
  'TRN - Turns': 'TRN',
  'X-CTY - Cross-Country': 'X-CTY',
};

/**
 * Extract the short code from a full exercise name
 * Example: "CCTS - Circuits & Landings" → "CCTS"
 */
const getExerciseShortCode = (fullExercise: string): string => {
  if (!fullExercise) return '';
  // Check if we have a mapped short code
  if (EXERCISE_SHORT_CODES[fullExercise]) {
    return EXERCISE_SHORT_CODES[fullExercise];
  }
  // Otherwise extract the part before " - "
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

  // ----- Date filter (local date in YYYY-MM-DD format) -----
  const todayLocal = new Date().toLocaleDateString('en-CA');       // e.g. "2026-08-03"
  const [selectedDate, setSelectedDate] = useState(todayLocal);    // Currently selected date

  // ----- Global State (from Zustand store) -----
  const store = useFlightStore();

  // Data collections
  const aircraft = store.aircraft;               // Fleet data
  const instructors = store.instructors;         // Instructor list
  const students = store.students;               // Student list

  // UI state from store
  const selectedSlot = store.selectedSlot;       // Currently clicked slot for modal
  const hoveredSlot = store.hoveredSlot;         // Currently hovered slot for highlight
  const setSelectedSlot = store.setSelectedSlot; // Open/close detail modal
  const setHoveredSlot = store.setHoveredSlot;   // Track hover state

  // Data loading actions
  const loadScheduledFlights = store.loadScheduledFlights;  // Load real bookings from DB
  const scheduledFlights = store.scheduledFlights;          // All booked flights
  const loadAircraft = store.loadAircraft;
  const loadStudents = store.loadStudents;
  const loadInstructors = store.loadInstructors;
  const maintenanceRecords = store.maintenanceRecords;      // All maintenance records (for blocking slots)
  const loadMaintenanceRecords = store.loadMaintenanceRecords;
  const ftoSettings = store.ftoSettings;                    // School name / airport code for the printed schedule header
  const loadFTOSettings = store.loadFTOSettings;
  const getFTOSetting = store.getFTOSetting;

  // ----- Load data when component mounts -----
  useEffect(() => {
    loadAircraft();           // Load fleet for aircraft rows
    loadStudents();           // Load students for initials on blocks
    loadInstructors();        // Load instructors for initials on blocks
    loadScheduledFlights();   // Load booked flights for Gantt blocks
    loadMaintenanceRecords(); // Load maintenance records so we can block slots for aircraft under/scheduled for maintenance
  }, [loadAircraft, loadStudents, loadInstructors, loadScheduledFlights, loadMaintenanceRecords]);

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
  const filteredFlights = scheduledFlights.filter(flight => {
    const flightDate = new Date(flight.startTime).toLocaleDateString('en-CA');
    return flightDate === selectedDate;
  });

  // ----- Chart Configuration -----
  const HOURS = Array.from({ length: 17 }, (_, i) => i + 5); // 05:00 to 21:00 (17 hours)
  const activeAircraft = aircraft.filter(a => a.status !== 'GROUNDED'); // Only operational
  const totalHours = 17; // 5 AM to 10 PM = 17 hours

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

  // ----- Date navigation -----
  const changeDate = (days: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toLocaleDateString('en-CA'));
  };

  const goToToday = () => setSelectedDate(todayLocal);

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

    // ----- Sortie colours for the printed report (hex values) -----
    const sortiePrintColors: Record<string, string> = {
      DUAL: '#2563eb',
      SOLO: '#16a34a',
      MAINTENANCE: '#ca8a04',
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
          const label = getExerciseShortCode((flight as any).exercise || '') || 
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
    const exerciseEntries = Object.entries(EXERCISE_SHORT_CODES);
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
    setSelectedSlot(null);
    loadScheduledFlights();   // Refresh after modal closes
  };

  // Click-to-book: figure out the time from where the user clicked within
  // an aircraft's row, then open BookingForm pre-filled with that aircraft,
  // the currently selected date, and the computed time. Works for however
  // many aircraft are in the fleet — the row and its aircraft ID come
  // straight from the `activeAircraft.map(...)` below, nothing here assumes
  // a fixed count.
  const handleGridClick = (aircraftId: string, e: React.MouseEvent<HTMLDivElement>) => {
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
      const overdueNote = maintenanceBlock!.overdue ? ' (⚠️ past its planned finish — check the maintenance log)' : '';
      setErrorMessage(`🔧 ${ac?.registration || 'This aircraft'} is unavailable at ${startTime} — ${maintenanceBlock!.maintenanceType} maintenance ${when}.${overdueNote}`);
      setTimeout(() => setErrorMessage(''), 4000);
      return;
    }

    // Reject clicks on a past time slot immediately, instead of only
    // surfacing "can't book in the past" after the user opens the form,
    // fills it in, and hits Save.
    if (isSlotInPast(selectedDate, startTime)) {
      setErrorMessage(`⏰ ${startTime} on ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} is in the past — flights cannot be booked in the past. Please pick a future time slot.`);
      setTimeout(() => setErrorMessage(''), 4000);
      return;
    }

    setGridClickPrefill({ aircraftId, date: selectedDate, startTime });
    setEditingFlight(null);
    setShowBookingForm(true);
  };

  const handleBookingSuccess = (message: string) => {
    setShowBookingForm(false);
    setEditingFlight(null);
    setGridClickPrefill(null);
    setSuccessMessage(message);
    loadScheduledFlights();   // Refresh after booking
    setTimeout(() => setSuccessMessage(''), 3000); // Auto‑hide toast after 3 seconds
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <>
      {/* Main Schedule Board Container */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">

        {/* ----- Header Section ----- */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">📅 Flight Operations Board</h2>
            <p className="text-sm text-slate-400 mt-1">
              {new Date(selectedDate).toLocaleDateString('en-US', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              <span className="text-xs text-slate-500 ml-2">All times in IST</span>
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-3">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-600 transition cursor-pointer"
            >
              🖨️ Print Schedule
            </button>
            <button
              onClick={() => {
                setGridClickPrefill(null);
                setEditingFlight(null);
                setShowBookingForm(true);
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition cursor-pointer"
            >
              + Book Slot
            </button>
          </div>
        </div>

        {/* ----- Date Picker ----- */}
        <div className="flex items-center space-x-3 mb-4">
          <label className="text-sm text-slate-400">Date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1 text-white text-sm"
          />
          <button
            onClick={() => changeDate(-1)}
            className="px-3 py-1 bg-slate-700 text-slate-300 rounded text-sm hover:bg-slate-600"
          >
            ← Prev
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
          >
            Today
          </button>
          <button
            onClick={() => changeDate(1)}
            className="px-3 py-1 bg-slate-700 text-slate-300 rounded text-sm hover:bg-slate-600"
          >
            Next →
          </button>
        </div>

        {/* ----- Grid Line Legend ----- */}
        <div className="flex items-center space-x-6 mb-3 text-xs text-slate-500">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-0 border-t border-slate-600/40" />
            <span>Hour (IST)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-0 border-t border-dashed border-slate-600/20" />
            <span>Half‑hour (IST)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-0 border-t border-dotted border-blue-500/30" />
            <span>UTC Hour</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <span className="text-red-400">Current Time (IST)</span>
          </div>
        </div>

        {/* ----- Gantt Chart Area ----- */}
        <div className="overflow-x-auto scrollbar-thin" style={{ overflowX: 'auto' }}>
          <div className="min-w-[1400px]">

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
                      <span className="text-xs text-slate-400 font-medium absolute -top-0 left-0 whitespace-nowrap">
                        {hour.toString().padStart(2, '0')}:00
                      </span>
                      <span className="text-[9px] text-blue-400/50 absolute top-4 left-0 whitespace-nowrap">
                        {Math.floor(utcHour).toString().padStart(2, '0')}:30 UTC
                      </span>
                      {/* Tick mark pointing down at the exact x-position of this hour's
                          gridline in the row below, so the eye has an explicit connector
                          between the label and its line instead of having to infer it. */}
                      <div className="absolute top-[26px] left-0 w-px h-2 bg-slate-500/60" />
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
                <div className="w-[140px] flex-shrink-0 sticky left-0 pr-3 flex flex-col justify-center z-20 bg-slate-900/80 rounded-l-lg px-2 py-1 pt-2"></div>

                <div className="flex-1 relative">
                  {HOURS.map((hour, idx) => {
                    const leftPercent = (idx / HOURS.length) * 100;
                    const halfHourPercent = ((idx + 0.5) / HOURS.length) * 100;
                    return (
                      <React.Fragment key={hour}>
                        {/* IST Hour line - solid, aligned under this hour's header label */}
                        <div className="absolute top-0 bottom-0 border-l border-slate-600/40" style={{ left: `${leftPercent}%` }} />
                        {/* IST Half-hour line - dashed */}
                        <div className="absolute top-0 bottom-0 border-l border-dashed border-slate-600/20" style={{ left: `${halfHourPercent}%` }} />
                        {/* UTC Hour line - dotted (coincides with the IST half-hour mark, since IST = UTC + 5:30) */}
                        <div className="absolute top-0 bottom-0 border-l border-dotted border-blue-500/30" style={{ left: `${halfHourPercent}%` }} />
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* Horizontal Row Lines – Alternating background for readability */}
              <div className="absolute inset-0 flex flex-col pointer-events-none z-0">
                {activeAircraft.map((ac, index) => (
                  <div key={ac.id} className="relative mb-3" style={{ minHeight: '60px' }}>
                    <div className={`absolute inset-0 rounded-lg ${
                      index % 2 === 0 ? 'bg-slate-800/10' : 'bg-transparent'
                    }`} />
                    <div className="absolute bottom-0 left-0 right-0 border-b border-slate-700/20" />
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
                          <div className="absolute inset-0 w-0.5 bg-red-500/70" />
                          <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-500/50" />
                          <div className="absolute -top-6 -left-10 text-[10px] text-red-400 whitespace-nowrap font-medium bg-slate-900/80 px-1 rounded">
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
                      <div className="w-[140px] flex-shrink-0 sticky left-0 pr-3 flex flex-col justify-center z-40 bg-slate-900 rounded-l-lg px-2 py-1">
                        <div className="flex items-center space-x-2">
                          <div className={`w-2 h-2 rounded-full ${
                            ac.status === 'ACTIVE' ? 'bg-green-400' :
                            ac.status === 'MAINTENANCE' ? 'bg-yellow-400' : 'bg-red-400'
                          }`} />
                          <div>
                            <p className="text-sm font-semibold text-white">{ac.registration}</p>
                            <p className="text-xs text-slate-400">{ac.type}</p>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          ⏱ {ac.hobbsTime}h | ⛽ {ac.currentFuel}L
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
                        className={`flex-1 relative rounded-r-lg border transition ${
                          maintenanceBlock?.allDay
                            ? `bg-slate-900/20 cursor-not-allowed ${maintenanceBlock.overdue ? 'border-red-600/40' : 'border-yellow-600/30'}`
                            : 'bg-slate-900/20 border-slate-700/20 cursor-pointer hover:bg-slate-700/10'
                        }`}
                        style={{ minHeight: '55px' }}
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
                            <span className={`text-xs font-semibold bg-slate-900/85 px-2 py-1 rounded whitespace-nowrap ${maintenanceBlock.overdue ? 'text-red-400' : 'text-yellow-400'}`}>
                              🔧{maintenanceBlock.allDay ? '' : ` ${minutesToHHMM(maintenanceBlock.startMin)}–${maintenanceBlock.openEnded ? '…' : minutesToHHMM(maintenanceBlock.endMin)}`} {maintenanceBlock.maintenanceType}
                              {maintenanceBlock.openEnded ? ' (ongoing)' : ''}{maintenanceBlock.overdue ? ' ⚠️ OVERDUE' : ''}
                            </span>
                          </div>
                        )}

                        {realFlights.map(flight => {
                          const style = getSlotStyle(flight);
                          // Use sortie type color: Dual=Blue, Solo=Green, Maintenance=Yellow
                          const colors = SORTIE_COLORS[flight.sortieType] || 'bg-gray-600/80 border-gray-400';
                          const instructor = instructors.find(i => i.id === flight.instructorId);
                          const student = flight.studentId
                            ? students.find(s => s.id === flight.studentId)
                            : undefined;
                          const isHovered = hoveredSlot === flight.id;
                          const flightStartIST = formatISTTime(flight.startTime);
                          const hasMaintenanceConflict = doesFlightConflictWithMaintenance(flight);

                          // Get exercise name and extract short code
                          const exerciseName = (flight as any).exercise || '';
                          const shortCode = getExerciseShortCode(exerciseName);

                          return (
                            <div
                              key={flight.id}
                              onClick={(e) => {
                                // Don't let this bubble up to the row's
                                // click-to-book handler — an existing block
                                // should only open its own detail modal.
                                e.stopPropagation();
                                handleSlotClick(flight as unknown as FlightSlot);
                              }}
                              onMouseEnter={() => setHoveredSlot(flight.id)}
                              onMouseLeave={() => setHoveredSlot(null)}
                              className={`absolute top-1 bottom-1 ${colors} border rounded-md px-2 py-1
                                cursor-pointer transition-all duration-200
                                hover:scale-[1.03] hover:z-30 hover:shadow-xl
                                ${isHovered ? 'ring-2 ring-white/50 z-20 scale-[1.03] shadow-xl' : 'z-10'}
                                ${flight.status === 'IN_PROGRESS' ? 'ring-1 ring-green-400/50' : ''}
                                ${hasMaintenanceConflict ? 'ring-2 ring-red-500 animate-pulse' : ''}`}
                              style={style}
                              title={`${student?.name || flight.studentName || 'No Student'} - ${exerciseName || flight.sortieType}\n${flightStartIST} IST${hasMaintenanceConflict ? '\n⚠️ Conflicts with scheduled maintenance on this aircraft — reassign or cancel' : ''}`}
                            >
                              {flight.status === 'IN_PROGRESS' && (
                                <span className="absolute top-1 right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                              )}
                              {hasMaintenanceConflict && (
                                <span className="absolute -top-1.5 -right-1.5 text-[10px] bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center shadow-lg z-20" title="Conflicts with scheduled maintenance">
                                  ⚠
                                </span>
                              )}
                              <div className="flex flex-col justify-center h-full min-w-0">
                                {/* Student initials / Instructor initials */}
                                <p className="text-xs font-bold text-white truncate">
                                  {student?.initials || '—'}/
                                  {instructor?.initials || 
                                    (flight.sortieType === 'SOLO' ? 'SOLO' : 
                                     flight.sortieType === 'MAINTENANCE' ? 'MTX' : '—')}
                                </p>
                                {/* Exercise short code (e.g., "CCTS", "ST&RE") */}
                                <p className="text-[10px] text-white/80 truncate font-medium">
                                  {shortCode || exerciseName}
                                </p>
                                {/* Date and start time */}
                                <p className="text-[9px] text-white/60 truncate">
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
                            <p className="text-xs text-slate-600">Available — click to book</p>
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
        <div className="mt-6 pt-4 border-t border-slate-700">

          {/* Sortie Type Legend */}
          <h3 className="text-sm font-medium text-slate-400 mb-3">Sortie Types</h3>
          <div className="flex flex-wrap gap-3 mb-4">
            {Object.entries(SORTIE_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center space-x-1.5">
                <div className={`w-3 h-3 rounded ${
                  SORTIE_COLORS[key]?.split(' ')[0] || 'bg-gray-500'
                } border ${
                  SORTIE_COLORS[key]?.split(' ')[1] || 'border-gray-400'
                }`} />
                <span className="text-xs text-slate-400">{label}</span>
              </div>
            ))}
          </div>

          {/* Exercise Legend – Table format with visible short codes (3 columns) */}
          <h3 className="text-sm font-medium text-slate-300 mb-3 mt-4">📋 Exercise Codes</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-700">
                  <th className="pb-2 pr-2 font-medium">Code</th>
                  <th className="pb-2 pr-4 font-medium">Description</th>
                  <th className="pb-2 pr-2 pl-2 font-medium">Code</th>
                  <th className="pb-2 pr-4 font-medium">Description</th>
                  <th className="pb-2 pl-2 font-medium">Code</th>
                  <th className="pb-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                {(() => {
                  const entries = Object.entries(EXERCISE_SHORT_CODES);
                  const rows: React.ReactElement[] = [];
                  for (let i = 0; i < entries.length; i += 3) {
                    const col1 = entries[i];
                    const col2 = entries[i + 1];
                    const col3 = entries[i + 2];
                    rows.push(
                      <tr key={i} className="border-b border-slate-700/30">
                        {/* Column 1 */}
                        <td className="py-1.5 pr-2">
                          <span className="text-white font-medium bg-slate-700 px-2 py-0.5 rounded text-[11px]">
                            {col1[1]}
                          </span>
                        </td>
                        <td className="py-1.5 pr-4 text-slate-300">
                          {col1[0].split(' - ')[1] || col1[0]}
                        </td>
                        {/* Column 2 */}
                        {col2 && (
                          <>
                            <td className="py-1.5 pr-2 pl-2">
                              <span className="text-white font-medium bg-slate-700 px-2 py-0.5 rounded text-[11px]">
                                {col2[1]}
                              </span>
                            </td>
                            <td className="py-1.5 pr-4 text-slate-300">
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
                              <span className="text-white font-medium bg-slate-700 px-2 py-0.5 rounded text-[11px]">
                                {col3[1]}
                              </span>
                            </td>
                            <td className="py-1.5 text-slate-300">
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
            loadScheduledFlights();
            setTimeout(() => setSuccessMessage(''), 3000);
          }}
        />
      )}

      {/* Success Toast – Green notification at bottom‑right on successful booking */}
      {successMessage && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-bounce">
          <span>{successMessage}</span>
          <button
            onClick={() => setSuccessMessage('')}
            className="ml-3 font-bold hover:text-green-200"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Toast – Red notification at bottom‑right for blocked actions
          (clicking a past time slot, or an aircraft unavailable for maintenance) */}
      {errorMessage && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 max-w-md">
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage('')}
            className="ml-3 font-bold hover:text-red-200"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}