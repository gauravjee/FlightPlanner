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

'use client';

// ----- React & state management -----
import { useState, useEffect } from 'react';
import { useFlightStore } from '@/lib/store';
import { FlightSlot, ScheduledFlight } from '@/types';

// ----- Child components -----
import FlightDetailModal from './FlightDetailModal';
import BookingForm from './BookingForm';

// ============================================================
// CONSTANTS – colour and label mappings for each sortie type
// ============================================================

// Background / border colours used on the Gantt chart blocks
const SORTIE_COLORS: Record<string, string> = {
  CIRCUIT_SOLO: 'bg-emerald-600/80 border-emerald-400',
  CIRCUIT_DUAL: 'bg-green-600/80 border-green-400',
  NAVIGATION: 'bg-blue-600/80 border-blue-400',
  INSTRUMENT: 'bg-purple-600/80 border-purple-400',
  STALL_RECOVERY: 'bg-orange-600/80 border-orange-400',
  EMERGENCY_PROCEDURES: 'bg-red-600/80 border-red-400',
  CHECK_RIDE: 'bg-yellow-500/80 border-yellow-400',
  CROSS_COUNTRY: 'bg-cyan-600/80 border-cyan-400',
  NIGHT_FLIGHT: 'bg-indigo-600/80 border-indigo-400',
  SOLO_CONSOLIDATION: 'bg-teal-600/80 border-teal-400',
};

// Short labels displayed inside the Gantt blocks
const SORTIE_LABELS: Record<string, string> = {
  CIRCUIT_SOLO: 'SOLO CCT',
  CIRCUIT_DUAL: 'DUAL CCT',
  NAVIGATION: 'NAV EX',
  INSTRUMENT: 'INST',
  STALL_RECOVERY: 'STALL/REC',
  EMERGENCY_PROCEDURES: 'EMERG',
  CHECK_RIDE: 'CHECK',
  CROSS_COUNTRY: 'X-CNTRY',
  NIGHT_FLIGHT: 'NIGHT',
  SOLO_CONSOLIDATION: 'SOLO CON',
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function ScheduleBoard() {

  // ----- Local UI state -----
  const [showBookingForm, setShowBookingForm] = useState(false);   // show / hide booking modal
  const [successMessage, setSuccessMessage] = useState('');        // green toast message
  const [editingFlight, setEditingFlight] = useState<ScheduledFlight | null>(null); // flight being edited

  // ----- Date filter (local date in YYYY-MM-DD) -----
  const todayLocal = new Date().toLocaleDateString('en-CA');       // e.g. "2026-08-02"
  const [selectedDate, setSelectedDate] = useState(todayLocal);    // currently selected date

  // ----- Global store -----
  const store = useFlightStore();

  // Data collections
  const aircraft = store.aircraft;               // fleet list
  const instructors = store.instructors;         // instructor list
  const students = store.students;               // student list

  // UI state from store
  const selectedSlot = store.selectedSlot;       // clicked slot for detail modal
  const hoveredSlot = store.hoveredSlot;         // hovered slot for highlight
  const setSelectedSlot = store.setSelectedSlot; // open / close detail modal
  const setHoveredSlot = store.setHoveredSlot;   // set hovered slot

  // Data loading actions
  const loadScheduledFlights = store.loadScheduledFlights; // fetch real bookings
  const scheduledFlights = store.scheduledFlights;         // all booked flights
  const loadAircraft = store.loadAircraft;
  const loadStudents = store.loadStudents;
  const loadInstructors = store.loadInstructors;

  // ----- Load data when component mounts -----
  useEffect(() => {
    loadAircraft();
    loadStudents();
    loadInstructors();
    loadScheduledFlights();
  }, [loadAircraft, loadStudents, loadInstructors, loadScheduledFlights]);

  // ----- Filter flights for the selected date -----
  const filteredFlights = scheduledFlights.filter(flight => {
  const flightDate = new Date(flight.startTime).toLocaleDateString('en-CA');
  return flightDate === selectedDate;
});

  // ----- Chart configuration -----
  const HOURS = Array.from({ length: 14 }, (_, i) => i + 6);   // 06:00 … 19:00
  const activeAircraft = aircraft.filter(a => a.status !== 'GROUNDED');
  const totalHours = 14;   // displayed time range in hours

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================

  /**
   * Convert a UTC ISO string to IST time string "HH:MM"
   * IST = UTC + 5:30
   */
  const formatISTTime = (isoString: string): string => {
    const date = new Date(isoString);
    const istHour = (date.getUTCHours() + 5.5 + 24) % 24;
    const istMinute = date.getUTCMinutes();
    return `${Math.floor(istHour).toString().padStart(2, '0')}:${istMinute.toString().padStart(2, '0')}`;
  };

  /**
   * Calculate the CSS position and width of a flight block on the Gantt chart.
   * Returns { left, width } as percentage strings.
   */
  const getSlotStyle = (slot: FlightSlot | ScheduledFlight) => {
    const startDate = new Date(slot.startTime);
    const endDate = new Date(slot.endTime);

    // Convert UTC hours to IST
    const startHourIST = (startDate.getUTCHours() + 5.5 + 24) % 24;
    const startMinutes = startDate.getUTCMinutes();
    const startHour = startHourIST + startMinutes / 60;

    const endHourIST = (endDate.getUTCHours() + 5.5 + 24) % 24;
    const endMinutes = endDate.getUTCMinutes();
    const endHour = endHourIST + endMinutes / 60;

    const duration = endHour - startHour;
    if (duration <= 0) return { left: '0%', width: '0%' };

    const leftPercent = ((startHour - 6) / totalHours) * 100;
    const widthPercent = (duration / totalHours) * 100;

    return {
      left: `${Math.max(0, leftPercent)}%`,
      width: `calc(${Math.max(0, widthPercent)}% - 4px)`,   // 4 px gap between blocks
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
      CIRCUIT_SOLO: '#059669',
      CIRCUIT_DUAL: '#16a34a',
      NAVIGATION: '#2563eb',
      INSTRUMENT: '#7c3aed',
      STALL_RECOVERY: '#ea580c',
      EMERGENCY_PROCEDURES: '#dc2626',
      CHECK_RIDE: '#ca8a04',
      CROSS_COUNTRY: '#0891b2',
      NIGHT_FLIGHT: '#4f46e5',
      SOLO_CONSOLIDATION: '#0d9488',
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
          // Calculate how many hours the flight spans
          const start = new Date(flight.startTime);
          const end = new Date(flight.endTime);
          const sH = Math.floor((start.getUTCHours() + 5.5 + 24) % 24);
          const eH = Math.ceil((end.getUTCHours() + 5.5 + 24) % 24);
          const span = Math.max(1, eH - sH);

          const color = sortiePrintColors[flight.sortieType] || '#6b7280';
          const label = SORTIE_LABELS[flight.sortieType] || flight.sortieType;
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

    // ----- Legend rows -----
    let legendRows = '';
    const entries = Object.entries(sortiePrintColors);
    for (let i = 0; i < entries.length; i += 4) {
      const chunk = entries.slice(i, i + 4);
      legendRows += `<tr>${chunk.map(([key, color]) =>
        `<td>
          <span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${color};margin-right:6px;"></span>
          ${SORTIE_LABELS[key] || key}
        </td>`
      ).join('')}</tr>`;
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
            * { margin:0; padding:0; box-sizing:border-box; }
            body {
              font-family:'Segoe UI',Arial,sans-serif;
              padding:24px;
              color:#1e293b;
              background:#fff;
            }
            h2 { text-align:center; font-size:20px; margin-bottom:4px; }
            .sub { text-align:center; font-size:12px; color:#64748b; margin-bottom:16px; }
            table { width:100%; border-collapse:collapse; font-size:11px; margin-top:16px; }
            th {
              background:#1e293b; color:#fff; padding:6px 4px;
              border:1px solid #334155; font-size:10px; text-align:center;
            }
            td {
              padding:6px 2px; border:1px solid #cbd5e1;
              text-align:center; height:40px;
            }
            .footer {
              margin-top:24px; text-align:center; font-size:10px;
              color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:12px;
            }
            @media print { body { margin:0; } }
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
                ${HOURS.map(h => `<th style="width:${colWidth}">${h.toString().padStart(2,'0')}:00</th>`).join('')}
              </tr>
            </thead>
            <tbody>${ganttRows}</tbody>
          </table>

          <!-- Instructor & Student lists -->
          <div style="display:flex; gap:40px; margin-top:24px;">
            <div style="flex:1;">
              <h3 style="font-size:12px; margin-bottom:8px;">👨‍🏫 Instructors</h3>
              <table>
                <thead><tr><th>Initials</th><th>Name</th></tr></thead>
                <tbody>${instructorList || '<tr><td colspan="2">—</td></tr>'}</tbody>
              </table>
            </div>
            <div style="flex:1;">
              <h3 style="font-size:12px; margin-bottom:8px;">👨‍✈️ Students</h3>
              <table>
                <thead><tr><th>Initials</th><th>Name</th></tr></thead>
                <tbody>${studentList || '<tr><td colspan="2">—</td></tr>'}</tbody>
              </table>
            </div>
          </div>

          <!-- Sortie colour legend -->
          <table>${legendRows}</table>

          <div class="footer">
            Generated by FlightPro Manager &nbsp;|&nbsp; ${new Date().toLocaleString('en-IN')}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();

    // Give the browser a moment to render, then open the print dialog
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  // ----- Other event handlers -----
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
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <>
      {/* ----- Main schedule container ----- */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">

        {/* ----- Header with title and action buttons ----- */}
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
          <div className="flex items-center space-x-3">
            <button onClick={handlePrint}
              className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-600 transition cursor-pointer">
              🖨️ Print Schedule
            </button>
            <button onClick={() => setShowBookingForm(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition cursor-pointer">
              + Book Slot
            </button>
          </div>
        </div>

        {/* ----- Date picker ----- */}
        <div className="flex items-center space-x-3 mb-4">
          <label className="text-sm text-slate-400">Date:</label>
          <input type="date" value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1 text-white text-sm" />
          <button onClick={() => changeDate(-1)}
            className="px-3 py-1 bg-slate-700 text-slate-300 rounded text-sm hover:bg-slate-600">← Prev</button>
          <button onClick={goToToday}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600">Today</button>
          <button onClick={() => changeDate(1)}
            className="px-3 py-1 bg-slate-700 text-slate-300 rounded text-sm hover:bg-slate-600">Next →</button>
        </div>

        {/* ----- Grid‑line legend ----- */}
        <div className="flex items-center space-x-6 mb-3 text-xs text-slate-500">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-0 border-t border-slate-600/40" /><span>Hour (IST)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-0 border-t border-dashed border-slate-600/20" /><span>Half‑hour (IST)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-0 border-t border-dotted border-blue-500/30" /><span>UTC Hour</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <span className="text-red-400">Current Time (IST)</span>
          </div>
        </div>

        {/* ----- Gantt chart area ----- */}
        <div className="overflow-x-auto scrollbar-thin">
          <div className="min-w-[900px]">

            {/* Time header (IST + UTC labels) */}
            <div className="flex mb-1">
              <div className="w-[140px] flex-shrink-0" />
              {HOURS.map(hour => {
                const utcHour = (hour - 5.5 + 24) % 24;
                return (
                  <div key={hour} className="flex-1 relative">
                    <span className="text-xs text-slate-400 font-medium absolute -top-1 left-0">
                      {hour.toString().padStart(2, '0')}:00 IST
                    </span>
                    <span className="text-[9px] text-blue-400/50 absolute top-3 left-0">
                      {Math.floor(utcHour).toString().padStart(2, '0')}:30 UTC
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="relative">

              {/* Vertical grid lines (hour, half‑hour, UTC) */}
              <div className="absolute inset-0 flex pointer-events-none z-0">
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

              {/* Horizontal row lines (alternating background) */}
              <div className="absolute inset-0 flex flex-col pointer-events-none z-0">
                {activeAircraft.map((ac, index) => (
                  <div key={ac.id} className="relative mb-3" style={{ minHeight: '60px' }}>
                    <div className={`absolute inset-0 rounded-lg ${index % 2 === 0 ? 'bg-slate-800/10' : 'bg-transparent'}`} />
                    <div className="absolute bottom-0 left-0 right-0 border-b border-slate-700/20" />
                  </div>
                ))}
              </div>

              {/* Current time line (only when viewing today) */}
              {selectedDate === todayLocal && (() => {
                const now = new Date();
                const currentHourIST = now.getHours() + now.getMinutes() / 60;
                if (currentHourIST >= 6 && currentHourIST <= 20) {
                  const leftPercent = ((currentHourIST - 6) / totalHours) * 100;
                  return (
                    <div className="absolute top-0 bottom-0 z-30 pointer-events-none"
                      style={{ left: `calc(${leftPercent}% + 140px)` }}>
                      <div className="absolute inset-0 w-0.5 bg-red-500/70" />
                      <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-500/50" />
                      <div className="absolute -top-6 -left-10 text-[10px] text-red-400 whitespace-nowrap font-medium bg-slate-900/80 px-1 rounded">
                        {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Aircraft rows with flight blocks */}
              {activeAircraft.map(ac => {
                const realFlights = filteredFlights.filter(f => String(f.aircraftId) === String(ac.id));
                return (
                  <div key={ac.id} className="relative mb-3 z-10">
                    <div className="flex items-stretch" style={{ minHeight: '60px' }}>

                      {/* Aircraft label (left column) */}
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

                      {/* Flight blocks area */}
                      <div className="flex-1 relative bg-slate-900/20 rounded-r-lg border border-slate-700/20"
                        style={{ minHeight: '55px' }}>

                        {realFlights.map(flight => {
                          const style = getSlotStyle(flight);
                          const colors = SORTIE_COLORS[flight.sortieType] || 'bg-gray-600/80 border-gray-400';
                          const instructor = instructors.find(i => i.id === flight.instructorId);
                          const student = flight.studentId ? students.find(s => s.id === flight.studentId) : undefined;
                          const isHovered = hoveredSlot === flight.id;
                          const flightStartIST = formatISTTime(flight.startTime);

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
                              title={`${student?.name || flight.studentName || 'No Student'} - ${flight.sortieType.replace(/_/g, ' ')}\n${flightStartIST} IST`}
                            >
                              {flight.status === 'IN_PROGRESS' && (
                                <span className="absolute top-1 right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                              )}
                              <div className="flex flex-col justify-center h-full min-w-0">
                                <p className="text-xs font-bold text-white truncate">
                                  {student?.initials || flight.studentName?.split(' ').map(n => n[0]).join('') || 'Mx'}
                                  /
                                  {instructor?.initials || (flight.sortieType?.includes('SOLO') ? 'SOLO' : '—')}
                                </p>
                                <p className="text-[10px] text-white/80 truncate">
                                  {SORTIE_LABELS[flight.sortieType] || flight.sortieType}
                                </p>
                                <p className="text-[9px] text-white/60 truncate">
                                  {new Date(flight.startTime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} {flightStartIST}
                                </p>
                              </div>
                            </div>
                          );
                        })}

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

        {/* ----- Sortie type legend ----- */}
        <div className="mt-6 pt-4 border-t border-slate-700">
          <h3 className="text-sm font-medium text-slate-400 mb-3">Sortie Types</h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(SORTIE_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center space-x-1.5">
                <div className={`w-3 h-3 rounded ${SORTIE_COLORS[key]?.split(' ')[0] || 'bg-gray-500'} border ${SORTIE_COLORS[key]?.split(' ')[1] || 'border-gray-400'}`} />
                <span className="text-xs text-slate-400">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MODALS & TOASTS */}
      {/* ============================================================ */}

      {/* Flight detail modal */}
      {selectedSlot && (
        <FlightDetailModal
          slot={selectedSlot}
          onClose={handleCloseModal}
          onEdit={(flight) => {
            setEditingFlight(flight as ScheduledFlight);
            setShowBookingForm(true);
          }}
        />
      )}

      {/* Booking / Edit modal */}
      {showBookingForm && (
        <BookingForm
          onClose={() => { setShowBookingForm(false); setEditingFlight(null); }}
          onSuccess={handleBookingSuccess}
          existingFlight={editingFlight}
        />
      )}

      {/* Success toast */}
      {successMessage && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-bounce">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage('')} className="ml-3 font-bold hover:text-green-200">✕</button>
        </div>
      )}
    </>
  );
}