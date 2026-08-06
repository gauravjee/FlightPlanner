// components/schedule/BookingForm.tsx
// Modal form for booking new flight slots or editing existing ones.
//
// Features:
//   - IST → UTC conversion for storage
//   - Date validation (no past dates)
//   - 30‑minute buffer between flights on same aircraft
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
import { useFlightStore } from '@/lib/store';
import { ScheduledFlight } from '@/types';

// ============================================================
// PROPS
// ============================================================
interface Props {
  onClose: () => void;
  onSuccess: (message: string) => void;
  existingFlight?: ScheduledFlight | null;   // non‑null → edit mode
}

// ============================================================
// TIME SLOTS – 30‑minute increments from 06:00 to 22:00 IST
// ============================================================
const generateTimeSlots = (): { value: string; label: string }[] => {
  const slots: { value: string; label: string }[] = [];
  for (let h = 6; h <= 22; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hour = h.toString().padStart(2, '0');
      const minute = m.toString().padStart(2, '0');
      slots.push({ value: `${hour}:${minute}`, label: `${hour}:${minute} IST` });
    }
  }
  return slots;
};

const TIME_SLOTS = generateTimeSlots();
const todayLocal = new Date().toLocaleDateString('en-CA');   // local date in YYYY-MM-DD

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
export default function BookingForm({ onClose, onSuccess, existingFlight }: Props) {

  // ----- Store -----
  const {
    aircraft, students, instructors, scheduledFlights,
    bookFlight, loadAircraft, loadStudents, loadScheduledFlights,
    updateScheduledFlight,
    loadTrainingRequirements,           
    getRequirementsForStudent,         
  } = useFlightStore();

  // ----- Initial data load -----
  useEffect(() => {
    if (aircraft.length === 0) loadAircraft();
    if (students.length === 0) loadStudents();
    loadScheduledFlights();
  }, []);

  // ----- Default times (next full hour) -----
  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setHours(now.getHours() + 1, 0, 0, 0);
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setHours(defaultStart.getHours() + 2);

  // Helper to format a Date to HH:MM (rounded to nearest 30 min)
  const formatTime = (date: Date): string => {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes() >= 30 ? '30' : '00';
    return `${h}:${m}`;
  };

  // Helper to add hours to a time string
  const addHoursToTime = (timeStr: string, hoursToAdd: number): string => {
    const [h, m] = timeStr.split(':').map(Number);
    const totalMinutes = h * 60 + m + hoursToAdd * 60;
    const newH = Math.floor(totalMinutes / 60) % 24;
    const newM = totalMinutes % 60 >= 30 ? 30 : 0;
    return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
  };

  // ----- Form state -----
  const [form, setForm] = useState({
    aircraftId: '',
    instructorId: '',
    studentId: '',
    date: todayLocal,
    startTime: formatTime(defaultStart),
    endTime: formatTime(defaultEnd),
    sortieType: 'DUAL',          // DUAL | SOLO | MAINTENANCE
    exercise: '',                 // Exercise code (for DUAL & SOLO only)
    notes: '',
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
        startTime: formatTime(startDate),
        endTime: formatTime(endDate),
        sortieType: existingFlight.sortieType || 'DUAL',
        exercise: (existingFlight as any).exercise || '',
        notes: existingFlight.notes || '',
      });
    }
  }, [existingFlight]);

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

  // ============================================================
  // VALIDATION FUNCTIONS
  // ============================================================

  // Date must not be in the past
  const validateDate = (dateStr: string): string => {
    const selected = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selected < today) return '❌ Cannot book flights in the past.';
    return '';
  };

  // End time must be after start time, minimum 30 min duration
  const validateTimes = (startTime: string, endTime: string): string => {
    if (!startTime || !endTime) return '';
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if (eh * 60 + em <= sh * 60 + sm) return '❌ End time must be after start time.';
    if ((eh * 60 + em) - (sh * 60 + sm) < 30) return '❌ Minimum flight duration is 30 minutes.';
    return '';
  };

  // Start time must not be in the past (for today's date)
  const validateNotPast = (dateStr: string, timeStr: string): string => {
    const selected = new Date(`${dateStr}T${timeStr}:00`);
    if (selected < new Date()) return '❌ Cannot book a time slot in the past.';
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

  // Aircraft conflict – with 30‑minute buffer
  const getBookedAircraftIds = useMemo((): string[] => {
    if (!form.date || !form.startTime || !form.endTime) return [];
    const slotStart = new Date(`${form.date}T${form.startTime}:00+05:30`);
    const slotEnd = new Date(`${form.date}T${form.endTime}:00+05:30`);
    const bufferedStart = new Date(slotStart); bufferedStart.setMinutes(bufferedStart.getMinutes() - 30);
    const bufferedEnd = new Date(slotEnd); bufferedEnd.setMinutes(bufferedEnd.getMinutes() + 30);
    return scheduledFlights
      .filter(flight => {
        if (existingFlight && flight.id === existingFlight.id) return false;
        const fs = new Date(flight.startTime);
        const fe = new Date(flight.endTime);
        return fs < bufferedEnd && fe > bufferedStart;
      })
      .map(flight => flight.aircraftId);
  }, [form.date, form.startTime, form.endTime, scheduledFlights, existingFlight]);

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

      const checkStudentRequirements = async (studentId: string): Promise<string> => {
        // Load requirements for this student
        await loadTrainingRequirements(studentId);
        const reqs = getRequirementsForStudent(studentId);
        
        // Check for mandatory FRTOL(R) – required for solo
        if (form.sortieType === 'SOLO') {
          const frtol = reqs.find(r => r.requirementName.includes('FRTOL(R)'));
          if (frtol && !frtol.isCompleted) {
            return '❌ Student cannot fly solo without a valid FRTOL(R).';
          }
        }
        
        // Check SPL – required for any flying
        const spl = reqs.find(r => r.requirementName.includes('Student Pilot License'));
        if (spl && !spl.isCompleted) {
          return '❌ Student cannot fly without a valid Student Pilot License (SPL).';
        }
        
        return ''; // all good
      };

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

    // Student Requirements check
        // ===== CHECK STUDENT REQUIREMENTS (CPL Ground Classes, SPL, FRTOL) =====
    if (!isMaintenance && form.studentId) {
      // Load requirements for this student
      await loadTrainingRequirements(form.studentId);
      const studentReqs = getRequirementsForStudent(form.studentId);
      
      // Check SPL - required for any flying
      const spl = studentReqs.find(r => 
        r.requirementName.includes('Student Pilot License')
      );
      if (spl && !spl.isCompleted) {
        setError('❌ Student cannot fly without a valid Student Pilot License (SPL).');
        return;
      }
      
      // Check FRTOL(R) - required for solo flying
      if (isSolo) {
        const frtol = studentReqs.find(r => 
          r.requirementName.includes('FRTOL(R)')
        );
        if (frtol && !frtol.isCompleted) {
          setError('❌ Student cannot fly solo without a valid FRTOL(R).');
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">🕐 Start Time *</label>
              <select value={form.startTime} onChange={e => handleFieldChange('startTime', e.target.value)} required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
                {TIME_SLOTS.map(slot => <option key={slot.value} value={slot.value}>{slot.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">🕑 End Time *</label>
              <select value={form.endTime} onChange={e => handleFieldChange('endTime', e.target.value)} required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
                {TIME_SLOTS.map(slot => {
                  const [sh, sm] = (form.startTime || '06:00').split(':').map(Number);
                  const [eh, em] = slot.value.split(':').map(Number);
                  const isBeforeStart = (eh * 60 + em) <= (sh * 60 + sm);
                  return (
                    <option key={slot.value} value={slot.value} disabled={isBeforeStart}>
                      {slot.label}{isBeforeStart ? ' (before start)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* ===== DURATION ===== */}
          {form.startTime && form.endTime && getDuration() !== '--' && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 text-center">
              <p className="text-sm text-blue-400">⏱ Duration: <span className="font-bold">{getDuration()}</span></p>
            </div>
          )}

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
            {bookedAircraft.length > 0 && <p className="text-xs text-yellow-400 mt-1">🔴 {bookedAircraft.length} aircraft booked (30‑min buffer)</p>}
          </div>

          {/* ===== AIRCRAFT FUEL INFO ===== */}
          {selectedAircraft && (
            <div className="bg-slate-700/50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-400">Current Fuel Level</p>
              <p className="text-2xl font-bold text-white">{selectedAircraft.currentFuel}L</p>
              <p className="text-xs text-slate-500">Capacity: {selectedAircraft.fuelCapacity}L</p>
            </div>
          )}

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