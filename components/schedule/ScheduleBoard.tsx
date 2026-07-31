// components/schedule/ScheduleBoard.tsx
// Gantt chart schedule board showing all aircraft and their booked flight slots
// Features: 
//   - Click to view details, hover for highlight, print schedule, book new slots
//   - IST timezone display (converts UTC from database)
//   - Hour & half-hour grid lines (dashed for half-hours)
//   - Red current time indicator line
//   - Alternating row colors for readability
//   - Start time markers on each flight block
'use client';

import { useState, useEffect } from 'react';
import { useFlightStore } from '@/lib/store';
import { FlightSlot, ScheduledFlight } from '@/types';
import FlightDetailModal from './FlightDetailModal';
import BookingForm from './BookingForm';

// ============================================================
// CONSTANTS - Color and label mappings for sortie types
// ============================================================

// Background and border colors for each sortie type on the Gantt chart
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

// Short display labels for the Gantt chart blocks (limited space)
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
  // ----- UI State (local to this component) -----
  const [showBookingForm, setShowBookingForm] = useState(false);  // Toggle booking modal
  const [successMessage, setSuccessMessage] = useState('');        // Green toast message
  
  // ----- Global State (from Zustand store) -----
  const store = useFlightStore();
  const aircraft = store.aircraft;                          // Fleet data
  const schedule = store.schedule;                          // Mock schedule (legacy)
  const instructors = store.instructors;                    // Instructor list
  const students = store.students;                          // Student list
  const selectedSlot = store.selectedSlot;                  // Currently clicked slot for modal
  const hoveredSlot = store.hoveredSlot;                    // Currently hovered slot for highlight
  const setSelectedSlot = store.setSelectedSlot;            // Open/close detail modal
  const setHoveredSlot = store.setHoveredSlot;              // Track hover state
  const getSlotsForAircraft = store.getSlotsForAircraft;    // Get mock slots (legacy)
  const loadScheduledFlights = store.loadScheduledFlights;  // Load real bookings from DB
  const scheduledFlights = store.scheduledFlights;          // Real booked flights
  
  // ----- Load data when component mounts -----
  useEffect(() => {
    loadScheduledFlights();  // Fetch real bookings from Supabase
  }, [loadScheduledFlights]);
  
  // ----- Chart Configuration -----
  const HOURS = Array.from({ length: 14 }, (_, i) => i + 6); // 06:00 to 19:00 (14 hours displayed)
  const activeAircraft = aircraft.filter(a => a.status !== 'GROUNDED'); // Only show operational aircraft
  const totalHours = 14; // Total time range displayed (6 to 20)

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================
  
  /**
   * Format UTC ISO time string to IST display format
   * Converts UTC time to IST (UTC+5:30) for display on the Gantt chart
   * @param isoString - UTC ISO datetime string from database
   * @returns Formatted time string like "10:30"
   */
  const formatISTTime = (isoString: string): string => {
    const date = new Date(isoString);
    // Convert UTC hours to IST (add 5.5 hours, wrap around 24)
    const istHour = (date.getUTCHours() + 5.5 + 24) % 24;
    const istMinute = date.getUTCMinutes();
    return `${Math.floor(istHour).toString().padStart(2, '0')}:${istMinute.toString().padStart(2, '0')}`;
  };
  
  /**
   * Format UTC time to full IST display with label
   * @param isoString - UTC ISO datetime string
   * @returns Formatted string like "10:30 IST"
   */
  const formatISTTimeFull = (isoString: string): string => {
    return `${formatISTTime(isoString)} IST`;
  };
  
  /**
   * Calculate position and width of a flight block on the Gantt chart
   * Converts UTC time to IST, then to percentage-based positioning
   * @param slot - Flight slot with start and end times (UTC)
   * @returns CSS style object with left and width as percentages
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
    if (duration <= 0) return { left: '0%', width: '0%' }; // Invalid slot
    
    // Convert to percentages of the total time range (06:00 to 20:00)
    const leftPercent = ((startHour - 6) / totalHours) * 100;
    const widthPercent = (duration / totalHours) * 100;
    
    return {
      left: `${Math.max(0, leftPercent)}%`,
      width: `calc(${Math.max(0, widthPercent)}% - 4px)`, // 4px gap between blocks
    };
  };
  
  /**
   * Handle print button click
   * Opens browser's native print dialog
   */
  const handlePrint = () => {
    window.print();
  };
  
  /**
   * Handle click on a flight block in the Gantt chart
   * Opens the flight detail modal with full information
   */
  const handleSlotClick = (slot: FlightSlot) => {
    setSelectedSlot(slot);
  };
  
  /**
   * Close the flight detail modal
   */
  const handleCloseModal = () => {
    setSelectedSlot(null);
  };
  
  /**
   * Handle successful flight booking
   * Shows green toast message for 3 seconds then auto-hides
   */
  const handleBookingSuccess = (message: string) => {
    setShowBookingForm(false);
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 3000); // Auto-hide after 3 seconds
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <>
      {/* Main Schedule Board Container */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
        
        {/* ===== HEADER SECTION ===== */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-white">📅 Flight Operations Board</h2>
            <p className="text-sm text-slate-400 mt-1">
              {new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
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
        
        {/* ===== LEGEND - UTC GRID LINE EXPLANATION ===== */}
        <div className="flex items-center space-x-6 mb-3 text-xs text-slate-500">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-0 border-t border-slate-600/40" />
            <span>Hour (IST)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-0 border-t border-dashed border-slate-600/20" />
            <span>Half-hour (IST)</span>
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
        
        {/* ===== GANTT CHART AREA ===== */}
        <div className="overflow-x-auto scrollbar-thin">
          <div className="min-w-[900px]">
            
            {/* ----- Time Header Row ----- */}
            <div className="flex mb-1">
              <div className="w-[140px] flex-shrink-0" />
              {HOURS.map(hour => (
                <div key={hour} className="flex-1 relative">
                  {/* Hour label in IST */}
                  <span className="text-xs text-slate-400 font-medium absolute -top-1 left-0">
                    {hour.toString().padStart(2, '0')}:00
                  </span>
                  {/* UTC hour label (smaller, below) */}
                  <span className="text-[9px] text-blue-400/50 absolute top-3 left-0">
                    {(hour - 5.5 + 24) % 24 < 10 ? '0' : ''}{Math.floor((hour - 5.5 + 24) % 24)}:30 UTC
                  </span>
                </div>
              ))}
            </div>
            
            {/* ----- Aircraft Rows Container ----- */}
            <div className="relative">
              
              {/* ===== VERTICAL GRID LINES ===== */}
              <div className="absolute inset-0 flex pointer-events-none z-0">
                <div className="w-[140px] flex-shrink-0" />
                {HOURS.map(hour => (
                  <div key={hour} className="flex-1 relative">
                    {/* IST Hour line - solid thin */}
                    <div className="absolute inset-0 border-l border-slate-600/40" />
                    {/* IST Half-hour line - dashed */}
                    <div className="absolute inset-0 left-1/2 border-l border-dashed border-slate-600/20" />
                    {/* UTC Hour line - dotted blue */}
                    {(() => {
                      // UTC hour corresponds to IST hour - 5.5
                      const utcHour = hour - 5.5;
                      // Show UTC hour marker if it falls within this IST hour segment
                      // UTC hours fall at :30 past IST hours (since IST = UTC+5:30)
                      // So UTC 00:00 = IST 05:30, UTC 06:00 = IST 11:30, etc.
                      if (utcHour >= 0 && utcHour < 24) {
                        return (
                          <div 
                            className="absolute inset-0 left-1/2 border-l border-dotted border-blue-500/30" 
                            title={`${utcHour.toString().padStart(2, '0')}:00 UTC`}
                          />
                        );
                      }
                      return null;
                    })()}
                  </div>
                ))}
                {/* Final IST hour line at 20:00 */}
                <div className="flex-1 relative">
                  <div className="absolute inset-0 border-l border-slate-600/40" />
                </div>
              </div>
              
              {/* ===== HORIZONTAL ROW LINES (Alternating background) ===== */}
              <div className="absolute inset-0 flex flex-col pointer-events-none z-0">
                {activeAircraft.map((ac, index) => (
                  <div 
                    key={ac.id} 
                    className="relative mb-3" 
                    style={{ minHeight: '60px' }}
                  >
                    {/* Subtle alternating row background for better readability */}
                    <div className={`absolute inset-0 rounded-lg ${
                      index % 2 === 0 ? 'bg-slate-800/10' : 'bg-transparent'
                    }`} />
                    {/* Bottom border for each row */}
                    <div className="absolute bottom-0 left-0 right-0 border-b border-slate-700/20" />
                  </div>
                ))}
              </div>
              
              {/* ===== CURRENT TIME LINE (Red vertical line) ===== */}
              {(() => {
                const now = new Date();
                const currentHourIST = now.getHours() + now.getMinutes() / 60;
                // Only show if within display range (06:00 - 20:00)
                if (currentHourIST >= 6 && currentHourIST <= 20) {
                  const leftPercent = ((currentHourIST - 6) / totalHours) * 100;
                  return (
                    <div 
                      className="absolute top-0 bottom-0 z-30 pointer-events-none"
                      style={{ left: `calc(${leftPercent}% + 140px)` }}
                    >
                      {/* Red vertical line */}
                      <div className="absolute inset-0 w-0.5 bg-red-500/70" />
                      {/* Pulsing dot at top */}
                      <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-500/50" />
                      {/* Current time label */}
                      <div className="absolute -top-6 -left-10 text-[10px] text-red-400 whitespace-nowrap font-medium bg-slate-900/80 px-1 rounded">
                        {now.toLocaleTimeString('en-IN', { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          timeZone: 'Asia/Kolkata' 
                        })} IST
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
              
              {/* ===== AIRCRAFT ROWS ===== */}
              {activeAircraft.map((ac) => {
                const realFlights = scheduledFlights.filter(
                  f => String(f.aircraftId) === String(ac.id) && f.status !== 'CANCELLED'
                );
                
                return (
                  <div key={ac.id} className="relative mb-3 z-10">
                    <div className="flex items-stretch" style={{ minHeight: '60px' }}>
                      
                      {/* ----- Aircraft Label (Left Column) ----- */}
                      <div className="w-[140px] flex-shrink-0 pr-3 flex flex-col justify-center z-20 bg-slate-900/80 rounded-l-lg px-2 py-1">
                        <div className="flex items-center space-x-2">
                          {/* Status indicator dot */}
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            ac.status === 'ACTIVE' ? 'bg-green-400' : 
                            ac.status === 'MAINTENANCE' ? 'bg-yellow-400' : 'bg-red-400'
                          }`} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{ac.registration}</p>
                            <p className="text-xs text-slate-400 truncate">{ac.type}</p>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          ⏱ {ac.hobbsTime}h | ⛽ {ac.currentFuel}L
                        </div>
                        {/* Maintenance warning badge */}
                        {ac.status === 'MAINTENANCE' && (
                          <span className="text-xs text-yellow-400 mt-1">⚠ In Maintenance</span>
                        )}
                      </div>
                      
                      {/* ----- Flight Blocks Area ----- */}
                      <div className="flex-1 relative bg-slate-900/20 rounded-r-lg border border-slate-700/20" 
                           style={{ minHeight: '55px' }}>
                        
                        {/* Render real scheduled flights from database */}
                        {realFlights.map(flight => {
                          const style = getSlotStyle(flight);
                          const colors = SORTIE_COLORS[flight.sortieType] || 'bg-gray-600/80 border-gray-400';
                          const instructor = instructors.find(i => i.id === flight.instructorId);
                          const student = flight.studentId ? students.find(s => s.id === flight.studentId) : undefined;
                          const isHovered = hoveredSlot === flight.id;
                          const flightStartIST = formatISTTime(flight.startTime);
                          const flightEndIST = formatISTTime(flight.endTime);
                          
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
                              title={`${student?.name || flight.studentName || 'No Student'} - ${flight.sortieType.replace(/_/g, ' ')}\n${flightStartIST} → ${flightEndIST} IST`}
                            >
                              {/* Pulsing green dot for in-progress flights */}
                              {flight.status === 'IN_PROGRESS' && (
                                <span className="absolute top-1 right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                              )}
                              
                              {/* Flight Block Content */}
                              <div className="flex flex-col justify-center h-full min-w-0">
                                {/* Pilot initials */}
                                <p className="text-xs font-bold text-white truncate">
                                  {student?.initials || flight.studentName?.split(' ').map(n => n[0]).join('') || 'Mx'}
                                  /
                                  {instructor?.initials || '—'}
                                </p>
                                {/* Sortie type label */}
                                <p className="text-[10px] text-white/80 truncate">
                                  {SORTIE_LABELS[flight.sortieType] || flight.sortieType}
                                </p>
                                {/* Start time on the block */}
                                <p className="text-[9px] text-white/60 truncate">
                                  {flightStartIST}
                                </p>
                              </div>
                              
                              {/* Start time marker (white left edge indicator) */}
                              <div className="absolute -left-0.5 top-0 bottom-0 w-1 bg-white/30 rounded-l" />
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
        
        {/* ===== LEGEND SECTION ===== */}
        <div className="mt-6 pt-4 border-t border-slate-700">
          <h3 className="text-sm font-medium text-slate-400 mb-3">Sortie Types</h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(SORTIE_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center space-x-1.5">
                {/* Color swatch matching the Gantt block colors */}
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
      
      {/* Flight Detail Modal - Opens when a flight block is clicked */}
      {selectedSlot && (
        <FlightDetailModal 
          slot={selectedSlot} 
          onClose={handleCloseModal} 
        />
      )}
      
      {/* Booking Form Modal - Opens when "+ Book Slot" is clicked */}
      {showBookingForm && (
        <BookingForm 
          onClose={() => setShowBookingForm(false)}
          onSuccess={handleBookingSuccess}
        />
      )}
      
      {/* Success Toast - Green notification at bottom-right on successful booking */}
      {successMessage && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-bounce">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage('')} className="ml-3 font-bold hover:text-green-200">
            ✕
          </button>
        </div>
      )}
    </>
  );
}