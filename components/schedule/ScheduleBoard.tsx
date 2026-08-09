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
  const [editingFlight, setEditingFlight] = useState<ScheduledFlight | null>(null); // Flight being edited

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

  // ----- Load data when component mounts -----
  useEffect(() => {
    loadAircraft();           // Load fleet for aircraft rows
    loadStudents();           // Load students for initials on blocks
    loadInstructors();        // Load instructors for initials on blocks
    loadScheduledFlights();   // Load booked flights for Gantt blocks
  }, [loadAircraft, loadStudents, loadInstructors, loadScheduledFlights]);

  // ----- Filter flights for the selected date -----
  const filteredFlights = scheduledFlights.filter(flight => {
    const flightDate = new Date(flight.startTime).toLocaleDateString('en-CA');
    return flightDate === selectedDate;
  });

  // ----- Chart Configuration -----
  const HOURS = Array.from({ length: 14 }, (_, i) => i + 6); // 06:00 to 19:00 (14 hours)
  const activeAircraft = aircraft.filter(a => a.status !== 'GROUNDED'); // Only operational
  const totalHours = 14; // Total time range displayed

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================

  /**
   * Convert UTC ISO string to IST display format "HH:MM"
   * IST = UTC + 5:30
   */
  const formatISTTime = (isoString: string): string => {
    const date = new Date(isoString);
    const istHour = (date.getUTCHours() + 5.5 + 24) % 24;
    const istMinute = date.getUTCMinutes();
    return `${Math.floor(istHour).toString().padStart(2, '0')}:${istMinute.toString().padStart(2, '0')}`;
  };

  /**
   * Calculate position and width of a flight block on the Gantt chart.
   * Converts UTC time to IST, then to percentage-based positioning.
   */
  const getSlotStyle = (slot: FlightSlot | ScheduledFlight) => {
    const startDate = new Date(slot.startTime);
    const endDate = new Date(slot.endTime);

    // Convert UTC to IST for display positioning
    const startHourIST = (startDate.getUTCHours() + 5.5 + 24) % 24;
    const startMinutes = startDate.getUTCMinutes();
    const startHour = startHourIST + startMinutes / 60;

    const endHourIST = (endDate.getUTCHours() + 5.5 + 24) % 24;
    const endMinutes = endDate.getUTCMinutes();
    const endHour = endHourIST + endMinutes / 60;

    const duration = endHour - startHour;
    if (duration <= 0) return { left: '0%', width: '0%' };

    // Convert to percentages of the total time range (06:00 to 20:00)
    const leftPercent = ((startHour - 6) / totalHours) * 100;
    const widthPercent = (duration / totalHours) * 100;

    return {
      left: `${Math.max(0, leftPercent)}%`,
      width: `calc(${Math.max(0, widthPercent)}% - 4px)`, // 4px gap between blocks
    };
  };

  // ----- Date navigation -----
  const changeDate = (days: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toLocaleDateString('en-CA'));
  };

  const goToToday = () => setSelectedDate(todayLocal);

  // ============================================================
  // PRINT FUNCTION – generates a clean white‑background report
  // ============================================================
  const handlePrint = () => {
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
            Horizon Flight Training Academy | VOBL – Bangalore<br/>
            ${dateStr} | All times in IST
          </p>

          <!-- Gantt‑style schedule -->
          <table>
            <thead>
              <tr>
                <th style="width:${colWidth}">Aircraft</th>
                ${HOURS.map(h => `<th style="width:${colWidth}">${h.toString().padStart(2, '0')}:00</th>`).join('')}
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

  const handleBookingSuccess = (message: string) => {
    setShowBookingForm(false);
    setEditingFlight(null);
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
              onClick={() => setShowBookingForm(true)}
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
        <div className="overflow-x-auto scrollbar-thin">
          <div className="min-w-[900px]">

            {/* Time Header Row – Shows hours from 06:00 to 19:00 with IST and UTC labels */}
            <div className="flex mb-1">
              <div className="w-[140px] flex-shrink-0" />
              {HOURS.map(hour => {
                const utcHour = (hour - 5.5 + 24) % 24;
                return (
                  <div key={hour} className="flex-1 relative">
                    <span className="text-xs text-slate-400 font-medium absolute -top-0 left-2">
                      {hour.toString().padStart(2, '0')}:00
                    </span>
                    <span className="text-[9px] text-blue-400/50 absolute top-4 left-1">
                      {Math.floor(utcHour).toString().padStart(2, '0')}:30 UTC
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Aircraft Rows Container */}
            <div className="relative mt-8">

              {/* Vertical Grid Lines – Solid for hours, dashed for half‑hours, dotted for UTC */}
              <div className="absolute inset-0 flex pointer-events-none z-0">
                <div className="w-[140px] flex-shrink-0 pr-3 flex flex-col justify-center z-20 bg-slate-900/80 rounded-l-lg px-2 py-1 pt-2"></div>
                <div className="w-[140px] flex-shrink-0" />
                {HOURS.map(hour => {
                  const utcHour = hour - 5.5;
                  return (
                    <div key={hour} className="flex-1 relative">
                      <div className="absolute inset-0 border-l border-slate-600/40" />
                      <div className="absolute inset-0 left-1/2 border-l border-dashed border-slate-600/20" />
                      {utcHour >= 0 && utcHour < 24 && (
                        <div className="absolute inset-0 left-1/2 border-l border-dotted border-blue-500/30" />
                      )}
                    </div>
                  );
                })}
                <div className="flex-1 relative">
                  <div className="absolute inset-0 border-l border-slate-600/40" />
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

              {/* Current Time Line – Red vertical line showing current IST time (only when viewing today) */}
              {selectedDate === todayLocal && (() => {
                const now = new Date();
                const currentHourIST = now.getHours() + now.getMinutes() / 60;
                if (currentHourIST >= 6 && currentHourIST <= 20) {
                  const leftPercent = ((currentHourIST - 6) / totalHours) * 100;
                  return (
                    <div
                      className="absolute top-0 bottom-0 z-30 pointer-events-none"
                      style={{ left: `calc(${leftPercent}% + 140px)` }}
                    >
                      <div className="absolute inset-0 w-0.5 bg-red-500/70" />
                      <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-500/50" />
                      <div className="absolute -top-6 -left-10 text-[10px] text-red-400 whitespace-nowrap font-medium bg-slate-900/80 px-1 rounded">
                        {now.toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Asia/Kolkata',
                        })} IST
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
                return (
                  <div key={ac.id} className="relative mb-3 z-10">
                    <div className="flex items-stretch" style={{ minHeight: '60px' }}>

                      {/* Aircraft Label – Left column with registration, type, hours, fuel */}
                      <div className="w-[140px] flex-shrink-0 pr-3 flex flex-col justify-center z-20 bg-slate-900/80 rounded-l-lg px-2 py-1">
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

                      {/* Flight Blocks Area – Where colored blocks appear */}
                      <div
                        className="flex-1 relative bg-slate-900/20 rounded-r-lg border border-slate-700/20"
                        style={{ minHeight: '55px' }}
                      >
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

                          // Get exercise name and extract short code
                          const exerciseName = (flight as any).exercise || '';
                          const shortCode = getExerciseShortCode(exerciseName);

                          return (
                            <div
                              key={flight.id}
                              onClick={() => handleSlotClick(flight as unknown as FlightSlot)}
                              onMouseEnter={() => setHoveredSlot(flight.id)}
                              onMouseLeave={() => setHoveredSlot(null)}
                              className={`absolute top-1 bottom-1 ${colors} border rounded-md px-2 py-1 
                                cursor-pointer transition-all duration-200 
                                hover:scale-[1.03] hover:z-30 hover:shadow-xl
                                ${isHovered ? 'ring-2 ring-white/50 z-20 scale-[1.03] shadow-xl' : 'z-10'}
                                ${flight.status === 'IN_PROGRESS' ? 'ring-1 ring-green-400/50' : ''}`}
                              style={style}
                              title={`${student?.name || flight.studentName || 'No Student'} - ${exerciseName || flight.sortieType}\n${flightStartIST} IST`}
                            >
                              {flight.status === 'IN_PROGRESS' && (
                                <span className="absolute top-1 right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
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

                        {/* Empty state when no flights scheduled */}
                        {realFlights.length === 0 && (
                          <div className="flex items-center justify-center h-full">
                            <p className="text-xs text-slate-600">Available</p>
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
            setEditingFlight(sf);
            setShowBookingForm(true);
          }
        }}
        />
      )}

      {/* Booking Form Modal – Opens when "+ Book Slot" is clicked */}
      {showBookingForm && (
        <BookingForm
          onClose={() => {
            setShowBookingForm(false);
            setEditingFlight(null);
          }}
          onSuccess={handleBookingSuccess}
          existingFlight={editingFlight}
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
    </>
  );
}