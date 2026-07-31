// components/flights/FlightRecordForm.tsx
// Modal form for logging a new flight in a student's logbook
'use client';

import { useState, useEffect } from 'react';
import { useFlightStore } from '@/lib/store';

interface Props {
  onClose: () => void;
  studentId?: string;  // Optional: pre-select student
}

export default function FlightRecordForm({ onClose, studentId }: Props) {
  const { students, aircraft, instructors, addFlightRecord, loadStudents, loadAircraft } = useFlightStore();
  
  // Load data if empty
  useEffect(() => {
    if (students.length === 0) loadStudents();
    if (aircraft.length === 0) loadAircraft();
  }, []);
  
  const today = new Date().toISOString().split('T')[0];
  
  const [form, setForm] = useState({
    studentId: studentId || '',
    aircraftId: '',
    instructorId: '',
    flightDate: today,
    departureTime: '08:00',
    arrivalTime: '09:30',
    hobbsStart: 0,
    hobbsEnd: 0,
    landings: 1,
    flightType: 'DUAL',
    sortieType: 'CIRCUIT_DUAL',
    maneuvers: '',
    instructorNotes: '',
    studentPerformance: 3,
    weatherConditions: 'VMC',
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
    if (!form.studentId || !form.aircraftId || !form.instructorId) return;
    
    await addFlightRecord({
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
      flightType: form.flightType,
      sortieType: form.sortieType,
      maneuvers: form.maneuvers,
      instructorNotes: form.instructorNotes,
      studentPerformance: form.studentPerformance,
      weatherConditions: form.weatherConditions,
    });
    onClose();
  };

  const performanceStars = ['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
          <h3 className="text-lg font-semibold text-white">📝 Log Flight Record</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg cursor-pointer">
            <span className="text-slate-400 text-xl">✕</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Student, Aircraft, Instructor */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Student *</label>
              <select value={form.studentId} onChange={e => setForm(p => ({ ...p, studentId: e.target.value }))} required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white">
                <option value="">Select</option>
                {students.filter(s => s.status === 'ACTIVE').map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.initials})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Aircraft *</label>
              <select value={form.aircraftId} onChange={e => setForm(p => ({ ...p, aircraftId: e.target.value }))} required
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

          {/* Hobbs, Landings, Type */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Hobbs Start</label>
              <input type="number" value={form.hobbsStart || ''} onChange={e => setForm(p => ({ ...p, hobbsStart: parseFloat(e.target.value) || 0 }))}
                step="0.1" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white" />
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
            <div>
              <label className="block text-xs text-slate-400 mb-1">Flight Type</label>
              <select value={form.flightType} onChange={e => setForm(p => ({ ...p, flightType: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white">
                <option value="DUAL">Dual</option>
                <option value="SOLO">Solo</option>
                <option value="CHECK">Check Ride</option>
                <option value="NIGHT">Night</option>
              </select>
            </div>
          </div>

          {/* Sortie & Weather */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Sortie Type</label>
              <select value={form.sortieType} onChange={e => setForm(p => ({ ...p, sortieType: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white">
                <option value="CIRCUIT_DUAL">Circuit (Dual)</option>
                <option value="CIRCUIT_SOLO">Circuit (Solo)</option>
                <option value="NAVIGATION">Navigation</option>
                <option value="INSTRUMENT">Instrument</option>
                <option value="STALL_RECOVERY">Stall & Recovery</option>
                <option value="EMERGENCY_PROCEDURES">Emergency Procedures</option>
                <option value="CROSS_COUNTRY">Cross Country</option>
                <option value="SOLO_CONSOLIDATION">Solo Consolidation</option>
                <option value="CHECK_RIDE">Check Ride</option>
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