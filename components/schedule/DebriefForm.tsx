// components/schedule/DebriefForm.tsx
// Post-flight debrief form – records actual times, fuel, and instructor notes
'use client';

import { useState } from 'react';
import { useFlightStore } from '@/lib/store';
import { ScheduledFlight } from '@/types';

interface Props {
  flight: ScheduledFlight;
  onClose: () => void;
  onComplete: (message: string) => void;
}

export default function DebriefForm({ flight, onClose, onComplete }: Props) {
  const { aircraft, addFlightRecord, updateScheduledFlight, loadScheduledFlights } = useFlightStore();
  
  const ac = aircraft.find(a => String(a.id) === String(flight.aircraftId));
  
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA');
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

  const [form, setForm] = useState({
    actualStartTime: timeStr,
    actualEndTime: timeStr,
    hobbsStart: ac?.hobbsTime || 0,
    hobbsEnd: (ac?.hobbsTime || 0) + (flight.duration || 1),
    fuelBefore: ac?.currentFuel || 0,
    fuelAfter: Math.max(0, (ac?.currentFuel || 0) - 30), // estimate 30L per hour
    landings: 1,
    maneuversCompleted: '',
    instructorNotes: '',
    studentPerformance: 3,
    weatherConditions: 'VMC',
    createLogbook: true,
  });

  const [loading, setLoading] = useState(false);

  // Calculate flight time
  const calcHours = () => {
    const [sh, sm] = form.actualStartTime.split(':').map(Number);
    const [eh, em] = form.actualEndTime.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins <= 0) return 0;
    return Math.round((mins / 60) * 10) / 10;
  };

  const flightHours = calcHours();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Create logbook entry if enabled, and mark the flight COMPLETED.
      //
      // "Auto-create logbook entry" unchecked no longer means the training
      // record silently vanishes: the flight still counts as flown (status
      // COMPLETED, aircraft fuel/Hobbs still advance below — the physical
      // flight happened either way) but it's now explicitly flagged
      // `logbookPending` with the debrief data captured here saved
      // alongside it, so it shows up as a "Logbook Pending" item to finish
      // later from the Flights page (see FlightRecordForm's
      // scheduledFlightId/prefill props) instead of just disappearing.
      if (form.createLogbook) {
        await addFlightRecord({
          studentId: flight.studentId || '',
          aircraftId: flight.aircraftId,
          instructorId: flight.instructorId,
          flightDate: todayStr,
          departureTime: form.actualStartTime,
          arrivalTime: form.actualEndTime,
          hobbsStart: form.hobbsStart,
          hobbsEnd: form.hobbsEnd,
          totalHours: flightHours,
          landings: form.landings,
          flightType: flight.sortieType?.includes('SOLO') ? 'SOLO' : 'DUAL',
          sortieType: flight.sortieType || 'CIRCUIT_DUAL',
          maneuvers: form.maneuversCompleted,
          instructorNotes: form.instructorNotes,
          studentPerformance: form.studentPerformance,
          weatherConditions: form.weatherConditions,
        });
        await updateScheduledFlight(flight.id, { status: 'COMPLETED', logbookPending: false, pendingDebrief: null });
      } else {
        await updateScheduledFlight(flight.id, {
          status: 'COMPLETED',
          logbookPending: true,
          pendingDebrief: {
            flightDate: todayStr,
            departureTime: form.actualStartTime,
            arrivalTime: form.actualEndTime,
            hobbsStart: form.hobbsStart,
            hobbsEnd: form.hobbsEnd,
            landings: form.landings,
            maneuvers: form.maneuversCompleted,
            instructorNotes: form.instructorNotes,
            studentPerformance: form.studentPerformance,
            weatherConditions: form.weatherConditions,
          },
        });
      }

      // 2. Update aircraft fuel if changed — this reflects the physical
      // state of the aircraft, so it happens regardless of the logbook
      // toggle (the plane really did burn that fuel and advance its Hobbs).
      if (form.fuelAfter !== form.fuelBefore) {
        const { supabase } = await import('@/lib/supabase');
        await supabase
          .from('aircraft')
          .update({ current_fuel: form.fuelAfter, hobbs_time: form.hobbsEnd })
          .eq('id', flight.aircraftId);
      }

      await loadScheduledFlights();
      onComplete(
        form.createLogbook
          ? '✅ Flight completed & logbook updated!'
          : '✅ Flight checked out — logbook entry pending. Finish it later from the Flights page.'
      );
    } catch (err) {
      console.error('Debrief error:', err);
    } finally {
      setLoading(false);
    }
  };

  const performanceLabels = ['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700 sticky top-0 bg-slate-800 z-10 rounded-t-xl">
          <h3 className="text-lg font-semibold text-white">✅ Flight Debrief & Check-Out</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg cursor-pointer">
            <span className="text-slate-400 text-xl">✕</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Flight Info Banner */}
          <div className="bg-slate-700/50 rounded-lg p-3">
            <p className="text-sm text-white font-medium">
              {flight.studentName || 'No Student'} | {flight.sortieType?.replace(/_/g, ' ')}
            </p>
            <p className="text-xs text-slate-400">
              {flight.aircraftReg} | Instructor: {flight.instructorName}
            </p>
          </div>

          {/* Actual Times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Actual Start Time</label>
              <input
                type="time"
                value={form.actualStartTime}
                onChange={e => setForm(p => ({ ...p, actualStartTime: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Actual End Time</label>
              <input
                type="time"
                value={form.actualEndTime}
                onChange={e => setForm(p => ({ ...p, actualEndTime: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
          </div>

          {/* Flight Duration */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 text-center">
            <p className="text-sm text-blue-400">
              ⏱ Flight Time: <span className="font-bold">{flightHours.toFixed(1)} hrs</span>
            </p>
          </div>

          {/* Hobbs & Fuel */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Hobbs Start</label>
              <input type="number" value={form.hobbsStart || ''} step="0.1"
                onChange={e => setForm(p => ({ ...p, hobbsStart: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Hobbs End</label>
              <input type="number" value={form.hobbsEnd || ''} step="0.1"
                onChange={e => setForm(p => ({ ...p, hobbsEnd: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
          </div>

          {/* Fuel Before/After */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Fuel Before (L)</label>
              <input type="number" value={form.fuelBefore || ''}
                onChange={e => setForm(p => ({ ...p, fuelBefore: parseInt(e.target.value) || 0 }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Fuel After (L)</label>
              <input type="number" value={form.fuelAfter || ''}
                onChange={e => setForm(p => ({ ...p, fuelAfter: parseInt(e.target.value) || 0 }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
          </div>

          {/* Landings */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Landings</label>
            <input type="number" value={form.landings || ''} min={0}
              onChange={e => setForm(p => ({ ...p, landings: parseInt(e.target.value) || 0 }))}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
          </div>

          {/* Maneuvers */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Maneuvers Completed</label>
            <textarea value={form.maneuversCompleted}
              onChange={e => setForm(p => ({ ...p, maneuversCompleted: e.target.value }))}
              rows={2} placeholder="e.g., Normal circuits, Flapless approach, Glide approach"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
          </div>

          {/* Instructor Notes */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Instructor Debrief Notes</label>
            <textarea value={form.instructorNotes}
              onChange={e => setForm(p => ({ ...p, instructorNotes: e.target.value }))}
              rows={3} placeholder="Post-flight debrief and feedback..."
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
          </div>

          {/* Performance Rating */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Student Performance</label>
            <select value={form.studentPerformance}
              onChange={e => setForm(p => ({ ...p, studentPerformance: parseInt(e.target.value) }))}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm">
              {performanceLabels.map((stars, i) => (
                <option key={i} value={i + 1}>{stars} ({i + 1}/5)</option>
              ))}
            </select>
          </div>

          {/* Weather */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Weather Conditions</label>
            <select value={form.weatherConditions}
              onChange={e => setForm(p => ({ ...p, weatherConditions: e.target.value }))}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm">
              <option value="VMC">VMC - Visual Meteorological Conditions</option>
              <option value="IMC">IMC - Instrument Meteorological Conditions</option>
              <option value="MARGINAL">Marginal VFR</option>
              <option value="GUSTY">Gusty Winds</option>
              <option value="RAIN">Rain</option>
            </select>
          </div>

          {/* Create Logbook Toggle */}
          <div className="flex items-center space-x-2">
            <input type="checkbox" checked={form.createLogbook}
              onChange={e => setForm(p => ({ ...p, createLogbook: e.target.checked }))}
              className="w-4 h-4" />
            <label className="text-xs text-slate-400">
              Auto-create logbook entry
              {!form.createLogbook && (
                <span className="block text-slate-500 mt-0.5">
                  Unchecked: flight is still marked completed, but the logbook entry (hours, first-solo credit) stays pending until finished later from the Flights page.
                </span>
              )}
            </label>
          </div>

          {/* Buttons */}
          <div className="flex space-x-3 pt-4 border-t border-slate-700">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition cursor-pointer font-bold disabled:opacity-50">
              {loading ? 'Saving...' : '✅ Complete Flight'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}