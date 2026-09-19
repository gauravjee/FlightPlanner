// components/schedule/DebriefForm.tsx
// Post-flight debrief form – records actual times, fuel, and instructor notes
'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useAircraft, aircraftKey } from '@/lib/hooks/useAircraft';
import { updateScheduledFlight } from '@/lib/hooks/useScheduledFlights';
import { addFlightRecord } from '@/lib/hooks/useFlightRecords';
import { FLIGHT_RECORDS_WRITE_ROLES } from '@/lib/permissions';
import { mutate } from 'swr';
import { ScheduledFlight } from '@/types';
import { useEscapeToClose } from '@/lib/useEscapeToClose';

interface Props {
  flight: ScheduledFlight;
  onClose: () => void;
  onComplete: (message: string) => void;
  // 2026-09-12: added alongside the false-success fix below — previously
  // this form had no way to report a failed save at all, so handleSubmit
  // fell through to onComplete's "success" toast regardless.
  onError: (message: string) => void;
}

export default function DebriefForm({ flight, onClose, onComplete, onError }: Props) {
  useEscapeToClose(onClose);
  const { aircraft } = useAircraft();
  const { data: session } = useSession();

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
    // 2026-09-10 (PICUS) — see FlightRecordForm.tsx for why this is two
    // fields rather than one nullable number.
    studentWasPic: false,
    picusHours: '',
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

  // Same derivation the logbook write below uses. PICUS applies to a dual
  // sortie only — on a solo the student commands the whole flight and the
  // hours are derived, so offering the field would invite double-counting.
  const isDual = !flight.sortieType?.includes('SOLO');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 2026-09-12: added after a `student` session reached this form,
    // submitted it, and got a false "success" toast while the actual
    // logbook write 403'd server-side (see the handoff addendum). Neither
    // FlightDetailModal's Check-Out button nor this form previously checked
    // the signed-in user's role at all. Mirrors FLIGHT_RECORDS_WRITE_ROLES —
    // the same role set already enforced server-side on the addFlightRecord
    // POST below — so this is UX (fail fast, clear message) backed by a
    // real server-side gate, not the only line of defense.
    const role = session?.user?.role;
    if (!role || !FLIGHT_RECORDS_WRITE_ROLES.includes(role)) {
      onError('🔒 You don’t have permission to complete a flight debrief.');
      return;
    }

    // 2026-09-18 (P0 #3, hobbs integrity): this field has the same "clear
    // it, save without retyping" failure mode FlightRecordForm's Hobbs End
    // used to (parseFloat('') || 0) — and when "auto-create logbook entry"
    // is unchecked below, this form's own PATCH /api/aircraft/[id] call is
    // the only write that ever sees this value; the flight-records route's
    // own Hobbs End check never runs for that path. Both routes now reject
    // this server-side too — see app/api/aircraft/[id]/route.ts and
    // app/api/flight-records/route.ts — this is the same fail-fast courtesy.
    if (!form.hobbsEnd || form.hobbsEnd <= form.hobbsStart) {
      onError('❌ Hobbs End must be greater than Hobbs Start.');
      return;
    }

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
      //
      // 2026-09-12: both writes below now have their {success, error}
      // result checked — previously neither was, so a failed logbook save
      // (e.g. a 403) still fell through to marking the flight COMPLETED and
      // writing to `aircraft` unconditionally, then reported success
      // regardless. A failure now stops here: no status flip, no aircraft
      // write, and a real error surfaces via onError instead of the
      // "✅ ..." toast.
      if (form.createLogbook) {
        const recordResult = await addFlightRecord({
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
          picusHours: isDual && form.studentWasPic
            ? Math.min(parseFloat(form.picusHours) || 0, flightHours)
            : undefined,
        });
        if (!recordResult.success) {
          onError(`❌ ${recordResult.error || 'Failed to save the logbook entry.'} The flight was NOT marked complete — please try again.`);
          return;
        }
        const statusResult = await updateScheduledFlight(flight.id, { status: 'COMPLETED', logbookPending: false, pendingDebrief: null });
        if (!statusResult.success) {
          onError(`❌ Logbook entry saved, but the flight status could not be updated: ${statusResult.error || 'unknown error'}.`);
          return;
        }
      } else {
        const statusResult = await updateScheduledFlight(flight.id, {
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
        if (!statusResult.success) {
          onError(`❌ Failed to check out this flight: ${statusResult.error || 'unknown error'}.`);
          return;
        }
      }

      // 2. Update aircraft fuel if changed — this reflects the physical
      // state of the aircraft, so it happens regardless of the logbook
      // toggle (the plane really did burn that fuel and advance its Hobbs).
      //
      // 2026-09-18 (RLS exposure remediation, see
      // claude/rls-exposure-2026-09-18.md): this used to write straight to
      // Supabase with the anon key and no server-side role check at all —
      // any instructor can debrief a flight, but AIRCRAFT_WRITE_ROLES
      // (admin/super_admin only) meant this couldn't just route through
      // the existing PATCH /api/aircraft/[id]. That route now accepts a
      // fuel/Hobbs-only update from any FLIGHT_RECORDS_WRITE_ROLES session
      // (see its own header comment) — this call is scoped to exactly
      // those two fields so it stays on that narrower path. Only reached
      // once the step(s) above have actually succeeded (see 2026-09-12
      // note above) — an unauthorized or rejected save can no longer reach
      // this write at all.
      if (form.fuelAfter !== form.fuelBefore) {
        // 2026-09-19: when createLogbook is true, step 1 above
        // (addFlightRecord) already advanced aircraft.hobbs_time to this
        // exact same form.hobbsEnd — flight-records/route.ts is the
        // authoritative Hobbs writer for that path (see its own comment).
        // Resending hobbsTime here then trips this route's own strict
        // "> current reading" guard (aircraft/[id]/route.ts, added the same
        // day for the OTHER branch) and 400s — silently dropping the fuel
        // update too, since it shares this one PATCH body. Found live on
        // production 2026-09-19 completing a real stuck flight (id 46):
        // the debrief reported success, but currentFuel never moved.
        // Only the logbookPending branch still needs hobbsTime sent here —
        // for that branch flight-records/route.ts never runs, so this
        // route is the only place that ever writes it.
        const fuelBody: Record<string, unknown> = { currentFuel: form.fuelAfter };
        if (!form.createLogbook) fuelBody.hobbsTime = form.hobbsEnd;
        const fuelRes = await fetch(`/api/aircraft/${flight.aircraftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fuelBody),
        });
        if (!fuelRes.ok) {
          // Doesn't block the overall debrief — the flight is already
          // correctly marked complete above — but this used to be
          // completely unchecked, so a failure here was invisible even in
          // the console.
          const fuelResult = await fuelRes.json().catch(() => ({}));
          console.error('Error updating aircraft fuel/Hobbs:', fuelResult.error || fuelRes.status);
        } else {
          // 2026-08-28: this write used to leave the shared aircraft state
          // stale until something else happened to reload it (the old
          // store action was called unconditionally on nearly every page
          // mount, so it usually self-corrected soon after). Now that
          // aircraft is cached with a dedupingInterval, revalidate
          // explicitly so every mounted useAircraft() consumer picks up
          // the new fuel/hobbs values right away instead of possibly
          // showing a stale reading.
          await mutate(aircraftKey);
        }
      }

      // Cache already fresh — updateScheduledFlight local-splices.
      onComplete(
        form.createLogbook
          ? '✅ Flight completed & logbook updated!'
          : '✅ Flight checked out — logbook entry pending. Finish it later from the Flights page.'
      );
    } catch (err) {
      console.error('Debrief error:', err);
      onError('❌ Something went wrong saving this debrief. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const performanceLabels = ['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'];

  const inputClass = "w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]";

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="surface-card w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 z-10 rounded-t-xl bg-[var(--surface)]" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-lg font-semibold">✅ Flight Debrief & Check-Out</h3>
          <button onClick={onClose} className="p-2 hover:bg-[var(--surface-muted)] rounded-lg cursor-pointer" aria-label="Close">
            <span className="text-secondary text-xl">✕</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Flight Info Banner */}
          <div className="surface-inner p-3">
            <p className="text-sm font-medium">
              {flight.studentName || 'No Student'} | {flight.sortieType?.replace(/_/g, ' ')}
            </p>
            <p className="text-xs text-secondary">
              {flight.aircraftReg} | Instructor: {flight.instructorName}
            </p>
          </div>

          {/* Actual Times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-secondary mb-1">Actual Start Time</label>
              <input
                type="time"
                value={form.actualStartTime}
                onChange={e => setForm(p => ({ ...p, actualStartTime: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">Actual End Time</label>
              <input
                type="time"
                value={form.actualEndTime}
                onChange={e => setForm(p => ({ ...p, actualEndTime: e.target.value }))}
                className={inputClass}
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
              <label className="block text-xs text-secondary mb-1">Hobbs Start</label>
              <input type="number" value={form.hobbsStart || ''} step="0.1"
                onChange={e => setForm(p => ({ ...p, hobbsStart: parseFloat(e.target.value) || 0 }))}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">Hobbs End</label>
              <input type="number" value={form.hobbsEnd || ''} step="0.1"
                onChange={e => setForm(p => ({ ...p, hobbsEnd: parseFloat(e.target.value) || 0 }))}
                className={inputClass} />
            </div>
          </div>

          {/* Fuel Before/After */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-secondary mb-1">Fuel Before (L)</label>
              <input type="number" value={form.fuelBefore || ''}
                onChange={e => setForm(p => ({ ...p, fuelBefore: parseInt(e.target.value) || 0 }))}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">Fuel After (L)</label>
              <input type="number" value={form.fuelAfter || ''}
                onChange={e => setForm(p => ({ ...p, fuelAfter: parseInt(e.target.value) || 0 }))}
                className={inputClass} />
            </div>
          </div>

          {/* Landings */}
          <div>
            <label className="block text-xs text-secondary mb-1">Landings</label>
            <input type="number" value={form.landings || ''} min={0}
              onChange={e => setForm(p => ({ ...p, landings: parseInt(e.target.value) || 0 }))}
              className={inputClass} />
          </div>

          {/* PIC / PICUS — dual sorties only, and only when the logbook
              entry is being created here. With "Auto-create logbook entry"
              unchecked the record is finished later from the Flights page,
              and pendingDebrief has no field to carry this through; hiding
              it is better than accepting a tick that would be silently
              dropped. The instructor sets it on FlightRecordForm instead,
              which is where that deferred entry gets completed. */}
          {isDual && form.createLogbook && (
            <div className="surface-inner rounded-lg p-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.studentWasPic}
                  onChange={e => setForm(p => ({
                    ...p,
                    studentWasPic: e.target.checked,
                    picusHours: e.target.checked ? String(flightHours) : '',
                  }))}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  Student acted as Pilot in Command (PICUS)
                  <span className="block text-[11px] text-tertiary">
                    Counts toward the student&apos;s PIC hours on the Progress page.
                  </span>
                </span>
              </label>
              {form.studentWasPic && (
                <div className="mt-3 flex items-end gap-3">
                  <div>
                    <label className="block text-xs text-secondary mb-1">PICUS Hours</label>
                    <input
                      type="number" step="0.1" min={0} max={flightHours}
                      value={form.picusHours}
                      onChange={e => setForm(p => ({ ...p, picusHours: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <p className="text-[11px] text-tertiary pb-2">
                    of {flightHours.toFixed(1)} hrs flown.
                    {parseFloat(form.picusHours) > flightHours && (
                      <span className="block" style={{ color: 'var(--danger)' }}>
                        More than the flight time — will be capped at {flightHours.toFixed(1)}h on save.
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Maneuvers */}
          <div>
            <label className="block text-xs text-secondary mb-1">Maneuvers Completed</label>
            <textarea value={form.maneuversCompleted}
              onChange={e => setForm(p => ({ ...p, maneuversCompleted: e.target.value }))}
              rows={2} placeholder="e.g., Normal circuits, Flapless approach, Glide approach"
              className={inputClass} />
          </div>

          {/* Instructor Notes */}
          <div>
            <label className="block text-xs text-secondary mb-1">Instructor Debrief Notes</label>
            <textarea value={form.instructorNotes}
              onChange={e => setForm(p => ({ ...p, instructorNotes: e.target.value }))}
              rows={3} placeholder="Post-flight debrief and feedback..."
              className={inputClass} />
          </div>

          {/* Performance Rating */}
          <div>
            <label className="block text-xs text-secondary mb-1">Student Performance</label>
            <select value={form.studentPerformance}
              onChange={e => setForm(p => ({ ...p, studentPerformance: parseInt(e.target.value) }))}
              className={inputClass}>
              {performanceLabels.map((stars, i) => (
                <option key={i} value={i + 1}>{stars} ({i + 1}/5)</option>
              ))}
            </select>
          </div>

          {/* Weather */}
          <div>
            <label className="block text-xs text-secondary mb-1">Weather Conditions</label>
            <select value={form.weatherConditions}
              onChange={e => setForm(p => ({ ...p, weatherConditions: e.target.value }))}
              className={inputClass}>
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
            <label className="text-xs text-secondary">
              Auto-create logbook entry
              {!form.createLogbook && (
                <span className="block text-tertiary mt-0.5">
                  Unchecked: flight is still marked completed, but the logbook entry (hours, first-solo credit) stays pending until finished later from the Flights page.
                </span>
              )}
            </label>
          </div>

          {/* Buttons */}
          <div className="flex space-x-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 surface-inner hover:bg-[var(--surface-muted)] transition cursor-pointer">
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