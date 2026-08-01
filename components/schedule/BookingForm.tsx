// components/schedule/BookingForm.tsx
// Modal form for booking new flight slots
// Features: 
//   - IST timezone support (stores UTC, displays IST)
//   - Real-time conflict detection with available/booked aircraft grouping
//   - Date/time validation (no past dates, end must be after start)
//   - Auto-clears aircraft selection if it becomes unavailable
//   - Duration calculator
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useFlightStore } from '@/lib/store';

// Props interface for the booking form modal
interface Props {
  onClose: () => void;                           // Close the modal
  onSuccess: (message: string) => void;          // Callback when booking succeeds
}

export default function BookingForm({ onClose, onSuccess }: Props) {
  // ============================================================
  // STORE DATA - Get data and actions from Zustand
  // ============================================================
  const { 
    aircraft,                  // All aircraft in fleet
    students,                  // All active students
    instructors,               // All instructors
    scheduledFlights,          // Currently booked flights (for conflict detection)
    bookFlight,                // Action to create a new booking
    loadAircraft,              // Load aircraft if store is empty
    loadStudents,              // Load students if store is empty
    loadScheduledFlights       // Load bookings for conflict checking
  } = useFlightStore();
  
  // ============================================================
  // INITIAL DATA LOAD
  // ============================================================
  useEffect(() => {
    if (aircraft.length === 0) loadAircraft();     // Load fleet data
    if (students.length === 0) loadStudents();     // Load student data
    loadScheduledFlights();                         // Load existing bookings
  }, []);
  
  // ============================================================
  // DEFAULT TIMES - Set to next full hour in IST
  // ============================================================
  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setHours(now.getHours() + 1, 0, 0, 0); // Next full hour
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setHours(defaultStart.getHours() + 2);     // 2-hour block by default
  
  // Format Date object to HH:MM string for time inputs
  const formatTime = (date: Date): string => {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };
  
  // ============================================================
  // FORM STATE
  // ============================================================
  const [form, setForm] = useState({
    aircraftId: '',                                                    // Selected aircraft ID
    instructorId: '',                                                  // Selected instructor ID
    studentId: '',                                                     // Selected student ID (optional)
    date: defaultStart.toISOString().split('T')[0],                   // Date in YYYY-MM-DD format
    startTime: formatTime(defaultStart),                              // Start time HH:MM
    endTime: formatTime(defaultEnd),                                  // End time HH:MM
    sortieType: 'CIRCUIT_DUAL' as string,                             // Type of training flight
    notes: '',                                                         // Optional notes
  });
  
  const [loading, setLoading] = useState(false);          // Submit button loading state
  const [error, setError] = useState('');                  // Red error message
  const [conflictWarning, setConflictWarning] = useState(''); // Yellow conflict warning

  // ============================================================
  // VALIDATION FUNCTIONS
  // ============================================================
  
  /**
   * Check if selected date is in the past
   * Prevents booking flights on days that have already passed
   */
  const validateDate = (dateStr: string): string => {
    const selected = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Compare dates only, ignore time
    
    if (selected < today) {
      return '❌ Cannot book flights in the past. Please select today or a future date.';
    }
    return '';
  };
  
  /**
   * Check if end time is after start time
   * Ensures the booking has a positive duration
   */
  const validateTimes = (startTime: string, endTime: string): string => {
    if (!startTime || !endTime) return '';
    
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const startMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;
    
    if (endMinutes <= startMinutes) {
      return '❌ End time must be after start time.';
    }
    return '';
  };
  
  /**
   * Check if the selected time has already passed today
   * Only relevant when booking for today's date
   */
  const validateNotPast = (dateStr: string, timeStr: string): string => {
    const selected = new Date(`${dateStr}T${timeStr}:00`);
    const now = new Date();
    
    if (selected < now) {
      return '❌ Cannot book a time slot that has already passed.';
    }
    return '';
  };
  
  /**
   * Find which aircraft are already booked during the selected time slot
   * Uses UTC timestamps for accurate comparison with database
   * Returns array of booked aircraft IDs
   */
  const getBookedAircraftIds = useMemo((): string[] => {
    if (!form.date || !form.startTime || !form.endTime) return [];
    
    // Create IST dates and convert to UTC timestamps for comparison
    // IST is UTC+5:30, so we parse the date+time as IST
    const slotStartIST = new Date(`${form.date}T${form.startTime}:00+05:30`);
    const slotEndIST = new Date(`${form.date}T${form.endTime}:00+05:30`);
    const slotStart = slotStartIST.getTime(); // UTC timestamp
    const slotEnd = slotEndIST.getTime();      // UTC timestamp
    
    // Filter scheduled flights that overlap with our selected time
    return scheduledFlights
      .filter(flight => {
        if (flight.status === 'CANCELLED') return false; // Ignore cancelled
        const flightStart = new Date(flight.startTime).getTime();
        const flightEnd = new Date(flight.endTime).getTime();
        // Overlap condition: existing flight starts before new ends AND ends after new starts
        return flightStart < slotEnd && flightEnd > slotStart;
      })
      .map(flight => flight.aircraftId);
  }, [form.date, form.startTime, form.endTime, scheduledFlights]);
  
  /**
   * Get list of available aircraft (NOT booked during selected time)
   * Only includes ACTIVE aircraft
   */
  const availableAircraft = useMemo(() => {
    return aircraft.filter(ac => 
      ac.status === 'ACTIVE' && !getBookedAircraftIds.includes(String(ac.id))
    );
  }, [aircraft, getBookedAircraftIds]);
  
  /**
   * Get list of already booked aircraft (for display as disabled options)
   */
  const bookedAircraft = useMemo(() => {
    return aircraft.filter(ac => 
      ac.status === 'ACTIVE' && getBookedAircraftIds.includes(String(ac.id))
    );
  }, [aircraft, getBookedAircraftIds]);

  // ============================================================
  // FORM HANDLERS
  // ============================================================
  
  /**
   * Handle any form field change
   * Runs validation and updates conflict warnings automatically
   * Clears aircraft selection if it becomes unavailable
   */
  const handleFieldChange = (field: string, value: string) => {
    setError('');           // Clear previous error
    setConflictWarning(''); // Clear previous warning
    
    setForm(prev => {
      const updated = { ...prev, [field]: value };
      
      // When date or time changes, re-validate everything
      if (field === 'date' || field === 'startTime' || field === 'endTime') {
        
        // Validate date is not in past
        if (field === 'date') {
          const dateError = validateDate(value);
          if (dateError) setError(dateError);
        }
        
        // Validate end time is after start time
        const startT = field === 'startTime' ? value : prev.startTime;
        const endT = field === 'endTime' ? value : prev.endTime;
        const timeError = validateTimes(startT, endT);
        if (timeError) setError(timeError);
        
        // Check if the currently selected aircraft is still available
        // If not, clear the selection and show a warning
        if (prev.aircraftId && updated.date && updated.startTime && updated.endTime) {
          const slotStart = new Date(`${updated.date}T${updated.startTime}:00+05:30`).getTime();
          const slotEnd = new Date(`${updated.date}T${updated.endTime}:00+05:30`).getTime();
          
          const isBooked = scheduledFlights.some(flight => {
            if (flight.status === 'CANCELLED') return false;
            if (String(flight.aircraftId) !== prev.aircraftId) return false;
            const flightStart = new Date(flight.startTime).getTime();
            const flightEnd = new Date(flight.endTime).getTime();
            return flightStart < slotEnd && flightEnd > slotStart;
          });
          
          if (isBooked) {
            updated.aircraftId = ''; // Clear the now-unavailable selection
            const acReg = aircraft.find(a => String(a.id) === prev.aircraftId)?.registration || 'Selected aircraft';
            setConflictWarning(`⚠️ ${acReg} is already booked for this time slot. Please select another aircraft.`);
          }
        }
        
        // Validate the time hasn't already passed (for today's date)
        if (updated.date && updated.startTime) {
          const pastError = validateNotPast(updated.date, updated.startTime);
          if (pastError) setError(pastError);
        }
      }
      
      return updated;
    });
  };

  /**
   * Handle form submission
   * Converts IST time to UTC for database storage
   * Calls bookFlight which also runs server-side conflict check
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setConflictWarning('');
    
    // ===== CLIENT-SIDE VALIDATION =====
    if (!form.aircraftId) {
      setError('❌ Please select an aircraft.');
      return;
    }
    if (!form.instructorId) {
      setError('❌ Please select an instructor.');
      return;
    }
    
    const dateError = validateDate(form.date);
    if (dateError) { setError(dateError); return; }
    
    const timeError = validateTimes(form.startTime, form.endTime);
    if (timeError) { setError(timeError); return; }
    
    const pastError = validateNotPast(form.date, form.startTime);
    if (pastError) { setError(pastError); return; }
    
    setLoading(true);
    
    // ===== TIMEZONE CONVERSION: IST → UTC =====
    // User selects times in IST (Indian Standard Time = UTC+5:30)
    // Database stores times in UTC
    // We add +05:30 to the ISO string so JavaScript correctly parses it as IST
    const startIST = new Date(`${form.date}T${form.startTime}:00+05:30`);
    const endIST = new Date(`${form.date}T${form.endTime}:00+05:30`);
    
    // .toISOString() converts to UTC automatically
    const startTimeUTC = startIST.toISOString();
    const endTimeUTC = endIST.toISOString();
    
    // Log for debugging
    console.log('📅 Booking Times:', {
      date: form.date,
      startIST: `${form.startTime} IST`,
      startUTC: startTimeUTC,
      endIST: `${form.endTime} IST`,
      endUTC: endTimeUTC,
    });
    
    // ===== SAVE TO DATABASE =====
    const result = await bookFlight({
      aircraftId: form.aircraftId,
      instructorId: form.instructorId,
      studentId: form.studentId || undefined,
      startTime: startTimeUTC,  // Store as UTC
      endTime: endTimeUTC,      // Store as UTC
      sortieType: form.sortieType,
      notes: form.notes,
      status: 'SCHEDULED',          
      weatherBriefed: false,          
      notamBriefed: false,            
    });
    
    setLoading(false);
    
    if (result.success) {
      onSuccess(result.message); // Show green toast
      onClose();                 // Close modal
    } else {
      setError(result.message);  // Show red error
    }
  };

  // ============================================================
  // HELPER: Calculate flight duration for display
  // ============================================================
  const getDuration = (): string => {
    if (!form.startTime || !form.endTime) return '--';
    const [sh, sm] = form.startTime.split(':').map(Number);
    const [eh, em] = form.endTime.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins <= 0) return '--';
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return `${hours}h ${minutes > 0 ? `${minutes}m` : ''}`;
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    // Modal backdrop - click outside to close
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" 
      onClick={onClose}
    >
      {/* Modal content - stop click propagation to prevent closing */}
      <div 
        className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" 
        onClick={e => e.stopPropagation()}
      >
        
        {/* ===== MODAL HEADER ===== */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700 sticky top-0 bg-slate-800 z-10 rounded-t-xl">
          <h3 className="text-lg font-semibold text-white">📅 Book Flight Slot</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg cursor-pointer">
            <span className="text-slate-400 text-xl">✕</span>
          </button>
        </div>

        {/* ===== BOOKING FORM ===== */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          
          {/* ----- ERROR MESSAGE (Red) ----- */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 animate-pulse">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
          
          {/* ----- CONFLICT WARNING (Yellow) ----- */}
          {conflictWarning && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-sm text-yellow-400">{conflictWarning}</p>
            </div>
          )}

          {/* ===== DATE FIELD ===== */}
          {/* Placed first because date determines available slots */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              📅 Date <span className="text-red-400">*</span>
            </label>
            <input 
              type="date" 
              value={form.date} 
              onChange={e => handleFieldChange('date', e.target.value)}
              min={new Date().toISOString().split('T')[0]} // Cannot select past dates in date picker
              required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" 
            />
            <p className="text-xs text-slate-500 mt-1">
              All times are in IST (Indian Standard Time, UTC+5:30)
            </p>
          </div>

          {/* ===== START & END TIME ===== */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                🕐 Start Time <span className="text-red-400">*</span>
              </label>
              <input 
                type="time" 
                value={form.startTime} 
                onChange={e => handleFieldChange('startTime', e.target.value)}
                required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" 
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                🕑 End Time <span className="text-red-400">*</span>
              </label>
              <input 
                type="time" 
                value={form.endTime} 
                onChange={e => handleFieldChange('endTime', e.target.value)}
                required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" 
              />
            </div>
          </div>
          
          {/* ----- FLIGHT DURATION DISPLAY ----- */}
          {form.startTime && form.endTime && getDuration() !== '--' && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 text-center">
              <p className="text-sm text-blue-400">
                ⏱ Flight Duration: <span className="font-bold">{getDuration()}</span>
              </p>
            </div>
          )}

          {/* ===== AIRCRAFT SELECTION (with availability grouping) ===== */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              🛩️ Aircraft <span className="text-red-400">*</span>
              {form.date && form.startTime && form.endTime && (
                <span className="text-xs text-green-400 ml-1">
                  ({availableAircraft.length} available)
                </span>
              )}
            </label>
            <select 
              value={form.aircraftId} 
              onChange={e => handleFieldChange('aircraftId', e.target.value)}
              required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">-- Select Available Aircraft --</option>
              
              {/* ✅ AVAILABLE aircraft group - can be selected */}
              {availableAircraft.length > 0 && (
                <optgroup label="✅ AVAILABLE">
                  {availableAircraft.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.registration} ({a.type}) - Fuel: {a.currentFuel}L / {a.fuelCapacity}L
                    </option>
                  ))}
                </optgroup>
              )}
              
              {/* 🔴 BOOKED aircraft group - disabled, cannot be selected */}
              {bookedAircraft.length > 0 && (
                <optgroup label="🔴 ALREADY BOOKED FOR THIS SLOT">
                  {bookedAircraft.map(a => (
                    <option key={a.id} value={a.id} disabled className="text-red-400">
                      {a.registration} ({a.type}) - BOOKED
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            
            {/* Info message about booked aircraft */}
            {bookedAircraft.length > 0 && (
              <p className="text-xs text-yellow-400 mt-1">
                🔴 {bookedAircraft.length} aircraft already booked for this time slot
              </p>
            )}
            
            {/* Info message about non-active aircraft */}
            {aircraft.filter(a => a.status !== 'ACTIVE').length > 0 && (
              <p className="text-xs text-slate-500 mt-1">
                ⚠ {aircraft.filter(a => a.status !== 'ACTIVE').length} aircraft not available (Maintenance/Grounded)
              </p>
            )}
          </div>

          {/* ===== INSTRUCTOR SELECTION ===== */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              👨‍🏫 Instructor <span className="text-red-400">*</span>
            </label>
            <select 
              value={form.instructorId} 
              onChange={e => handleFieldChange('instructorId', e.target.value)}
              required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">Select Instructor</option>
              {instructors.map(i => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.initials}) - {i.ratings.join(', ')}
                </option>
              ))}
            </select>
          </div>

          {/* ===== STUDENT SELECTION (Optional) ===== */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              👨‍✈️ Student <span className="text-slate-500">(optional)</span>
            </label>
            <select 
              value={form.studentId} 
              onChange={e => handleFieldChange('studentId', e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">No Student (Check Ride / Maintenance Flight)</option>
              {students.filter(s => s.status === 'ACTIVE').map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.initials}) - {s.trainingStage} | {s.totalHours}h
                </option>
              ))}
            </select>
          </div>

          {/* ===== SORTIE TYPE ===== */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">🎯 Sortie Type</label>
            <select 
              value={form.sortieType} 
              onChange={e => handleFieldChange('sortieType', e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="CIRCUIT_DUAL">Circuit (Dual)</option>
              <option value="CIRCUIT_SOLO">Circuit (Solo)</option>
              <option value="NAVIGATION">Navigation</option>
              <option value="INSTRUMENT">Instrument</option>
              <option value="STALL_RECOVERY">Stall & Recovery</option>
              <option value="EMERGENCY_PROCEDURES">Emergency Procedures</option>
              <option value="CROSS_COUNTRY">Cross Country</option>
              <option value="SOLO_CONSOLIDATION">Solo Consolidation</option>
              <option value="CHECK_RIDE">Check Ride</option>
              <option value="NIGHT_FLIGHT">Night Flight</option>
            </select>
          </div>

          {/* ===== NOTES ===== */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">📝 Notes</label>
            <textarea 
              value={form.notes} 
              onChange={e => handleFieldChange('notes', e.target.value)}
              rows={2} 
              placeholder="Any special instructions, route details, or remarks..."
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" 
            />
          </div>

          {/* ===== ACTION BUTTONS ===== */}
          <div className="flex space-x-3 pt-4 border-t border-slate-700">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition cursor-pointer"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition cursor-pointer font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '⏳ Booking...' : '📅 Book Flight'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}