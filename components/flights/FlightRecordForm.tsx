// components/flights/FlightRecordForm.tsx
// Modal form for logging a new flight in a student's logbook
'use client';

import { useState, useEffect } from 'react';
import { useFlightStore } from '@/lib/store';
import { useEscapeToClose } from '@/lib/useEscapeToClose';

interface Props {
  onClose: () => void;
  studentId?: string;  // Optional: pre-select student
  // Set when this form is opened to resolve a "Logbook Pending" flight (see
  // DebriefForm.tsx / the Pending Logbook Entries panel on the Flights
  // page) — on a successful save, the linked scheduled flight's
  // logbookPending flag is cleared so it drops off that list.
  scheduledFlightId?: string;
  // Pre-fills the form from that flight's own data (aircraft/instructor/
  // student/sortie) plus whatever the debrief captured before leaving it
  // pending (hobbs, fuel-derived duration inputs, landings, maneuvers,
  // notes, performance, weather) — so completing the entry later doesn't
  // mean re-entering everything from scratch.
  prefill?: Partial<{
    aircraftId: string;
    instructorId: string;
    flightDate: string;
    departureTime: string;
    arrivalTime: string;
    hobbsStart: number;
    hobbsEnd: number;
    landings: number;
    sortieType: string;
    maneuvers: string;
    instructorNotes: string;
    studentPerformance: number;
    weatherConditions: string;
  }>;
}

export default function FlightRecordForm({ onClose, studentId, scheduledFlightId, prefill }: Props) {
  useEscapeToClose(onClose);
  const {
    students, aircraft, instructors, sortieTypes, exercises, addFlightRecord, updateScheduledFlight,
    loadStudents, loadAircraft, loadInstructors, loadSortieTypes, loadExercises,
  } = useFlightStore();

  // Load data if empty
  useEffect(() => {
    if (students.length === 0) loadStudents();
    if (aircraft.length === 0) loadAircraft();
    if (instructors.length === 0) loadInstructors();
    if (sortieTypes.length === 0) loadSortieTypes();
    if (exercises.length === 0) loadExercises();
  }, []);

  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    studentId: studentId || '',
    aircraftId: prefill?.aircraftId || '',
    instructorId: prefill?.instructorId || '',
    flightDate: prefill?.flightDate || today,
    departureTime: prefill?.departureTime || '08:00',
    arrivalTime: prefill?.arrivalTime || '09:30',
    hobbsStart: prefill?.hobbsStart ?? 0,
    hobbsEnd: prefill?.hobbsEnd ?? 0,
    landings: prefill?.landings ?? 1,
    sortieType: prefill?.sortieType || '',
    exercise: '',
    maneuvers: prefill?.maneuvers || '',
    instructorNotes: prefill?.instructorNotes || '',
    studentPerformance: prefill?.studentPerformance ?? 3,
    weatherConditions: prefill?.weatherConditions || 'VMC',
  });

  // Calculate total hours from departure/arrival times
  const calcHours = (dep: string, arr: string): number => {
    const [dh, dm] = dep.split(':').map(Number);
    const [ah, am] = arr.split(':').map(Number);
    const mins = (ah * 60 + am) - (dh * 60 + dm);
    return Math.max(0, Math.round((mins / 60) * 10) / 10);
  };

  const totalHours = calcHours(form.departureTime, form.arrivalTime);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.studentId || !form.aircraftId || !form.instructorId || !form.sortieType) return;

    // Flight Type used to be a separate hardcoded dropdown (Dual / Solo /
    // Check Ride / Night) that duplicated Sortie Type — which is now driven
    // by the same admin-configured sortie_types list, so asking for both
    // was just double entry. Instead of dropping the flight_type column's
    // value entirely (SOLO/DUAL hour totals in the logbook PDF and Progress
    // page both key off it), derive it from the selected sortie type's
    // requires_instructor / requires_student flags — the same flags Admin
    // Setup already uses to configure each sortie type:
    //   instructor + student required  -> DUAL
    //   student required, no instructor -> SOLO
    //   anything else (e.g. a Maintenance Flight sortie, which requires
    //     neither) -> falls back to the sortie's own code, so it isn't
    //     miscounted as either SOLO or DUAL hours.
    const selectedSortie = sortieTypes.find(st => st.type_code === form.sortieType);
    const derivedFlightType = selectedSortie
      ? selectedSortie.requires_instructor && selectedSortie.requires_student
        ? 'DUAL'
        : !selectedSortie.requires_instructor && selectedSortie.requires_student
          ? 'SOLO'
          : selectedSortie.type_code
      : form.sortieType;

    const result = await addFlightRecord({
      studentId: form.studentId,
      aircraftId: form.aircraftId,
      instructorId: form.instructorId,
      flightDate: form.flightDate,
      departureTime: form.departureTime,
      arrivalTime: form.arrivalTime,
      hobbsStart: form.hobbsStart,
      hobbsEnd: form.hobbsEnd,
      totalHours: totalHours,
      landings: form.landings,
      flightType: derivedFlightType,
      sortieType: form.sortieType,
      exercise: form.exercise,
      maneuvers: form.maneuvers,
      instructorNotes: form.instructorNotes,
      studentPerformance: form.studentPerformance,
      weatherConditions: form.weatherConditions,
    });

    if (result.success) {
      // Resolves the "Logbook Pending" flag on the flight this entry was
      // completing, if it was opened that way — see the scheduledFlightId
      // prop doc above.
      if (scheduledFlightId) {
        await updateScheduledFlight(scheduledFlightId, { logbookPending: false, pendingDebrief: null });
      }
      onClose();
    } else {
      // Keep the form open with everything the user entered still intact —
      // previously a failed save closed the form exactly like a successful
      // one, so nothing looked wrong even though nothing was saved.
      alert(`❌ Failed to save flight record: ${result.error || 'Unknown error'}`);
    }
  };

  const performanceStars = ['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
          <h3 className="text-lg font-semibold text-white">
            📝 {scheduledFlightId ? 'Complete Pending Logbook Entry' : 'Log Flight Record'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg cursor-pointer">
            <span className="text-slate-400 text-xl">✕</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Student, Aircraft, Instructor */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Student *</label>
              <select
                value={form.studentId}
                onChange={e => {
                  const id = e.target.value;
                  // Default Instructor to this student's assigned instructor
                  // (still changeable below) — this is what actually gets
                  // logged, so if the assigned instructor wasn't available
                  // and the student flew with someone else, that's captured
                  // by just picking a different instructor afterward. Only
                  // defaults when the student actually has one assigned;
                  // otherwise leaves whatever instructor was already picked.
                  const student = students.find(s => s.id === id);
                  const assignedIsValid = student?.assignedInstructorId
                    && instructors.some(i => i.id === student.assignedInstructorId);
                  setForm(p => ({
                    ...p,
                    studentId: id,
                    instructorId: assignedIsValid ? student!.assignedInstructorId! : p.instructorId,
                  }));
                }}
                required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white">
                <option value="">Select</option>
                {students.filter(s => s.status === 'ACTIVE').map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.initials})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Aircraft *</label>
              <select
                value={form.aircraftId}
                onChange={e => {
                  const id = e.target.value;
                  // Auto-fill Hobbs Start from the selected aircraft's
                  // current Hobbs meter reading (still editable below) —
                  // done here in the change handler, not a useEffect, so
                  // it's a plain synchronous update tied to the action that
                  // caused it.
                  const selected = aircraft.find(a => a.id === id);
                  setForm(p => ({ ...p, aircraftId: id, hobbsStart: selected ? selected.hobbsTime : 0 }));
                }}
                required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white">
                <option value="">Select</option>
                {aircraft.filter(a => a.status === 'ACTIVE').map(a => (
                  <option key={a.id} value={a.id}>{a.registration} ({a.type})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Instructor *</label>
              <select value={form.instructorId} onChange={e => setForm(p => ({ ...p, instructorId: e.target.value }))} required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white">
                <option value="">Select</option>
                {instructors.map(i => (
                  <option key={i.id} value={i.id}>{i.name} ({i.initials})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date & Times */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Date</label>
              <input type="date" value={form.flightDate} onChange={e => setForm(p => ({ ...p, flightDate: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Departure</label>
              <input type="time" value={form.departureTime} onChange={e => setForm(p => ({ ...p, departureTime: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Arrival</label>
              <input type="time" value={form.arrivalTime} onChange={e => setForm(p => ({ ...p, arrivalTime: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Duration</label>
              <input type="text" value={`${totalHours} hrs`} readOnly
                className="w-full bg-slate-600 border border-slate-500 rounded-lg px-2 py-2 text-sm text-green-400 font-bold" />
            </div>
          </div>

          {/* Hobbs & Landings */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Hobbs Start</label>
              <input type="number" value={form.hobbsStart || ''} onChange={e => setForm(p => ({ ...p, hobbsStart: parseFloat(e.target.value) || 0 }))}
                step="0.1" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white" />
              <p className="text-[10px] text-slate-500 mt-0.5">Auto-filled from the aircraft&apos;s current Hobbs — edit if needed.</p>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Hobbs End</label>
              <input type="number" value={form.hobbsEnd || ''} onChange={e => setForm(p => ({ ...p, hobbsEnd: parseFloat(e.target.value) || 0 }))}
                step="0.1" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Landings</label>
              <input type="number" value={form.landings || ''} onChange={e => setForm(p => ({ ...p, landings: parseInt(e.target.value) || 0 }))}
                min={0} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white" />
            </div>
          </div>

          {/* Sortie, Exercise & Weather */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Sortie Type *</label>
              <select value={form.sortieType} onChange={e => setForm(p => ({ ...p, sortieType: e.target.value }))}
                required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white">
                <option value="">Select</option>
                {sortieTypes.map(st => (
                  <option key={st.id} value={st.type_code}>{st.type_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Exercise</label>
              <select value={form.exercise} onChange={e => setForm(p => ({ ...p, exercise: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white">
                <option value="">Select</option>
                {exercises.map(ex => (
                  <option key={ex.short_code} value={ex.short_code} title={ex.full_description}>
                    {ex.short_code} — {ex.exercise_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Performance</label>
              <select value={form.studentPerformance} onChange={e => setForm(p => ({ ...p, studentPerformance: parseInt(e.target.value) }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white">
                {performanceStars.map((stars, i) => (
                  <option key={i} value={i + 1}>{stars} ({i + 1}/5)</option>
                ))}
              </select>
            </div>
          </div>

          {/* Maneuvers */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Maneuvers Performed</label>
            <textarea value={form.maneuvers} onChange={e => setForm(p => ({ ...p, maneuvers: e.target.value }))}
              rows={2} placeholder="e.g., Normal circuits, Flapless approach, Glide approach"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
          </div>

          {/* Instructor Notes */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Instructor Notes</label>
            <textarea value={form.instructorNotes} onChange={e => setForm(p => ({ ...p, instructorNotes: e.target.value }))}
              rows={2} placeholder="Feedback on student performance..."
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
          </div>

          {/* Buttons */}
          <div className="flex space-x-3 pt-4 border-t border-slate-700">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition cursor-pointer">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition cursor-pointer font-bold">
              📝 Save Flight Record
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}