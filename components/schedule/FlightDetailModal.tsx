// components/schedule/FlightDetailModal.tsx
// Flight Detail Modal - Shows full information about a selected flight
// ============================================================
// Features:
//   - Displays aircraft, instructor, student, times, sortie, weather
//   - Shows NOTAM warnings relevant to the flight
//   - Flight readiness checklist (aircraft status, weather, fuel, medical)
//   - Action buttons based on flight status:
//     * SCHEDULED: Check-In, Edit, Cancel
//     * IN_PROGRESS: Check-Out/Debrief, Cancel
//     * COMPLETED: Print Brief only
//   - Print Brief button for all statuses
// ============================================================

'use client';

import { useFlightStore } from '@/lib/store';
import { cancelFlight, updateScheduledFlight } from '@/lib/hooks/useScheduledFlights';
import { useAircraft, getAircraftById } from '@/lib/hooks/useAircraft';
import { useInstructors, getInstructorById } from '@/lib/hooks/useInstructors';
import { useStudents, getStudentById } from '@/lib/hooks/useStudents';
import { FlightSlot } from '@/types';
import { useState } from 'react';
import { useEscapeToClose } from '@/lib/useEscapeToClose';
// ============================================================
// PROPS
// ============================================================
interface Props {
  slot: FlightSlot;                              // The flight being viewed
  onClose: () => void;                           // Close the modal
  onEdit?: (slot: FlightSlot) => void;           // Edit or Check-Out handler
}

// The `slot` passed in here is always a ScheduledFlight underneath (see
// ScheduleBoard's handleSlotClick, which casts one to FlightSlot) — it
// carries these two extra fields that the narrower FlightSlot type
// doesn't declare. Local extension so this file can read them without
// widening FlightSlot for every other consumer of that type.
type SlotWithExtras = FlightSlot & { logbookPending?: boolean; exercise?: string };

export default function FlightDetailModal({ slot, onClose, onEdit }: Props) {
  useEscapeToClose(onClose);
  // ============================================================
  // STORE DATA
  // ============================================================
  const { aircraft: allAircraft } = useAircraft();
  const { instructors: allInstructors } = useInstructors();
  const { students: allStudents } = useStudents();
  const {
    weather,                  // Current weather data
    notams,                   // Active NOTAMs
  } = useFlightStore();
  // cancelFlight/updateScheduledFlight now come from the SWR hook (Stage 5,
  // 2026-09-01) — both local-splice their write, so no manual reload needed.

  // ============================================================
  // DERIVED DATA
  // ============================================================
  const aircraft = getAircraftById(allAircraft, slot.aircraftId);       // Aircraft for this flight
  const instructor = getInstructorById(allInstructors, slot.instructorId);  // Instructor for this flight
  const student = slot.studentId ? getStudentById(allStudents, slot.studentId) : undefined; // Student (if any)

  const [showCancelReason, setShowCancelReason] = useState(false); // Check Cancellation Reason modal visibility
  

  // Calculate flight duration in hours
  const duration = (new Date(slot.endTime).getTime() - new Date(slot.startTime).getTime()) / 3600000;

  // ----- Check-In / Check-Out time windows -----
  // Check-In opens 1 hour before the SCHEDULED start time (no upper bound —
  // crew can still check in late). Check-Out only opens once the SCHEDULED
  // end time has actually passed. Both compare against real Date objects
  // (not wall-clock strings), so this is correct regardless of the
  // browser's timezone.
  const now = new Date();
  const scheduledStart = new Date(slot.startTime);
  const scheduledEnd = new Date(slot.endTime);
  const checkInOpensAt = new Date(scheduledStart.getTime() - 60 * 60 * 1000);
  const canCheckIn = now >= checkInOpensAt;
  const canCheckOut = now >= scheduledEnd;

  // ============================================================
  // ACTION HANDLERS
  // ============================================================

  /**
   * Cancel the flight — soft-cancel (status set to CANCELLED, row kept)
   * with a reason, so the Daily Flying Report can count Weather vs.
   * Maintenance vs. Other cancellations. Reloads schedule afterward.
   */
  const handleCancel = async (reason: 'WEATHER' | 'MAINTENANCE' | 'OTHER') => {
    await cancelFlight(slot.id, reason);
    onClose();
  };


  /**
   * Handle Edit button click
   * Calls the onEdit callback passed from ScheduleBoard
   * For SCHEDULED flights: opens BookingForm for editing
   * For IN_PROGRESS flights: opens DebriefForm for check-out
   */
  const handleEdit = () => {
    if (onEdit) onEdit(slot);
    onClose();
  };

  /**
   * Open browser print dialog
   * Prints the current page (user can select PDF printer)
   */
  const handlePrint = () => {
    window.print();
  };

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================


  /**
 * Format UTC ISO string to IST time for display.
 * IST = UTC + 5:30
 * Uses manual conversion (not browser timezone) for reliability.
 */
    const formatIST = (isoString: string): string => {
      const date = new Date(isoString);
      const utcHours = date.getUTCHours();
      const utcMinutes = date.getUTCMinutes();
      
      // Add 5 hours 30 minutes for IST
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
   * Format date for display
   */
  const formatDate = (isoString: string): string => {
    return new Date(isoString).toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
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
      {/* Modal content - stop propagation to prevent closing when clicking inside */}
      <div
        className="surface-card w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >

        {/* ============================================================ */}
        {/* HEADER */}
        {/* ============================================================ */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 rounded-t-xl z-10" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <h3 className="text-lg font-semibold">✈️ Flight Details</h3>
          <button onClick={onClose} className="p-2 hover:bg-[var(--surface-muted)] rounded-lg cursor-pointer">
            <span className="text-secondary text-xl">✕</span>
          </button>
        </div>

        {/* ============================================================ */}
        {/* CONTENT */}
        {/* ============================================================ */}
        <div className="p-4 space-y-4">

          {/* ----- STATUS BADGE + DURATION ----- */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                slot.status === 'IN_PROGRESS' ? 'bg-green-500/20 text-green-400' :
                slot.status === 'COMPLETED' ? 'bg-blue-500/20 text-blue-400' :
                slot.status === 'CANCELLED' ? 'bg-red-500/20 text-red-400' :
                'bg-yellow-500/20 text-yellow-400'
              }`}>
                {slot.status.replace('_', ' ')}
              </span>
              {/* Debrief was completed with "auto-create logbook entry"
                  unchecked — flight counts as flown, but hours/first-solo
                  credit won't land until a logbook entry is finished for it
                  from the Flights page. See DebriefForm.tsx. */}
              {(slot as SlotWithExtras).logbookPending && (
                <span
                  className="px-3 py-1 rounded-full text-sm font-medium bg-amber-500/20 text-amber-400"
                  title="Flight is completed but no logbook entry has been created yet — finish it from the Flights page."
                >
                  📋 Logbook Pending
                </span>
              )}
            </div>
            <span className="text-sm text-secondary">{duration.toFixed(1)} hours</span>
          </div>

          {/* ----- AIRCRAFT INFO ----- */}
          {aircraft && (
            <div className="bg-[var(--surface-muted)] rounded-lg p-3">
              <p className="text-xs text-secondary mb-2">🛩️ AIRCRAFT</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{aircraft.registration}</p>
                  <p className="text-sm text-secondary">{aircraft.model}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-secondary">Hobbs: {aircraft.hobbsTime}h</p>
                  <p className="text-sm text-secondary">Fuel: {aircraft.currentFuel}L / {aircraft.fuelCapacity}L</p>
                </div>
              </div>
            </div>
          )}

          {/* ----- TIME & SORTIE ----- */}
          <div className="bg-[var(--surface-muted)] rounded-lg p-3">
            <p className="text-xs text-secondary mb-2">⏰ SCHEDULE</p>
            <p className="font-medium">
              {formatDate(slot.startTime)}
            </p>
            <p className="font-medium mt-1">
              {formatIST(slot.startTime)} → {formatIST(slot.endTime)} IST
            </p>
            <span className="inline-block mt-2 px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs">
              {(slot as SlotWithExtras).exercise || slot.sortieType?.replace(/_/g, ' ') || 'N/A'}
            </span>
            <span className={`inline-block mt-2 ml-2 px-2 py-0.5 rounded text-xs ${
              String(slot.sortieType) === 'DUAL' ? 'bg-blue-500/20 text-blue-400' :
              String(slot.sortieType) === 'SOLO' ? 'bg-green-500/20 text-green-400' :
              'bg-yellow-500/20 text-yellow-400'
            }`}>
              {slot.sortieType}
            </span>
          </div>

          {/* ----- PERSONNEL ----- */}
          <div className="grid grid-cols-2 gap-3">
            {/* Instructor */}
            {instructor && (
              <div className="bg-[var(--surface-muted)] rounded-lg p-3">
                <p className="text-xs text-secondary mb-1">👨‍🏫 INSTRUCTOR</p>
                <p className="font-medium">{instructor.name}</p>
                <p className="text-xs text-secondary">{instructor.initials}</p>
                <p className="text-xs text-tertiary">{instructor.licenseNumber}</p>
              </div>
            )}
            {/* Student (or Maintenance) */}
            {student ? (
              <div className="bg-[var(--surface-muted)] rounded-lg p-3">
                <p className="text-xs text-secondary mb-1">👨‍✈️ STUDENT</p>
                <p className="font-medium">{student.name}</p>
                <p className="text-xs text-secondary">{student.initials} | {student.trainingStage}</p>
                <p className="text-xs text-tertiary">{student.totalHours}h total</p>
              </div>
            ) : (
              <div className="bg-[var(--surface-muted)] rounded-lg p-3">
                <p className="text-xs text-secondary mb-1">🔧 PURPOSE</p>
                <p className="font-medium">Maintenance / Check Flight</p>
              </div>
            )}
          </div>

          {/* ----- WEATHER ----- */}
          <div className="bg-[var(--surface-muted)] rounded-lg p-3">
            <p className="text-xs text-secondary mb-2">🌤️ WEATHER</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-xs text-tertiary">Wind</p>
                <p className="text-sm font-medium">{weather.windDirection}°/{weather.windSpeed}kt</p>
              </div>
              <div>
                <p className="text-xs text-tertiary">Visibility</p>
                <p className="text-sm font-medium">{weather.visibility >= 9999 ? '10km+' : `${weather.visibility}m`}</p>
              </div>
              <div>
                <p className="text-xs text-tertiary">Ceiling</p>
                <p className="text-sm font-medium">{weather.ceiling >= 9999 ? 'Clear' : `${weather.ceiling}ft`}</p>
              </div>
              <div>
                <p className="text-xs text-tertiary">Rules</p>
                <p className="text-sm text-green-400 font-medium">{weather.flightRules}</p>
              </div>
            </div>
          </div>

          {/* ----- ACTIVE NOTAMS ----- */}
          {notams.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-xs text-yellow-400 font-medium mb-2">⚠️ ACTIVE NOTAMS</p>
              {notams.slice(0, 3).map((n, i) => (
                <p key={i} className="text-xs text-yellow-300/80 mt-1">
                  <span className="font-medium">{n.notamNumber}</span>: {n.text}
                </p>
              ))}
            </div>
          )}

          {/* ----- FLIGHT READINESS CHECKLIST ----- */}
          <div className="bg-[var(--surface-muted)] rounded-lg p-3">
            <p className="text-xs text-secondary mb-3">✅ FLIGHT READINESS</p>
            <div className="space-y-2">
              {[
                { label: 'Aircraft Airworthy', ok: aircraft?.status === 'ACTIVE' },
                { label: 'Weather Within Limits', ok: weather.flightRules === 'VFR' || weather.flightRules === 'MVFR' },
                { label: 'Fuel Sufficient', ok: (aircraft?.currentFuel || 0) > 30 },
                { label: 'Student Medical Valid', ok: student ? new Date(student.medicalExpiry) > new Date() : true },
              ].map((item, i) => (
                <div key={i} className="flex items-center space-x-2">
                  <span className={`text-lg ${item.ok ? 'text-green-400' : 'text-red-400'}`}>
                    {item.ok ? '✅' : '❌'}
                  </span>
                  <span className={`text-xs ${item.ok ? 'text-secondary' : 'text-red-400'}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* ACTION BUTTONS */}
        {/* Buttons change based on flight status */}
        {/* ============================================================ */}
        <div className="flex items-center justify-end space-x-2 p-4 border-t sticky bottom-0 rounded-b-xl" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>

          {/* ----- CLOSE BUTTON ----- */}
          {/* Always visible */}
          <button onClick={onClose} className="px-4 py-2 text-sm text-secondary hover:opacity-80 transition cursor-pointer">
            Close
          </button>

          {/* ----- CHECK-IN BUTTON ----- */}
          {/* Only for SCHEDULED flights → Changes status to IN_PROGRESS.
              Disabled until 1 hour before the scheduled start time. */}
          {slot.status === 'SCHEDULED' && (
            <div className="flex flex-col items-end">
              <button
                onClick={async () => {
                  if (!canCheckIn) return;
                  await updateScheduledFlight(slot.id, { status: 'IN_PROGRESS' });
                  onClose();
                }}
                disabled={!canCheckIn}
                title={canCheckIn ? undefined : `Check-in opens at ${formatIST(checkInOpensAt.toISOString())} IST`}
                className={`px-4 py-2 text-sm rounded-lg transition ${
                  canCheckIn
                    ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30 cursor-pointer'
                    : 'bg-[var(--surface-muted)] text-tertiary cursor-not-allowed'
                }`}
              >
                ✅ Check-In
              </button>
              {!canCheckIn && (
                <p className="text-[10px] text-tertiary mt-1">Opens {formatIST(checkInOpensAt.toISOString())} IST</p>
              )}
            </div>
          )}

          {/* ----- CHECK-OUT / DEBRIEF BUTTON ----- */}
          {/* Only for IN_PROGRESS flights → Opens DebriefForm.
              Disabled until the scheduled end time has passed. */}
          {slot.status === 'IN_PROGRESS' && (
            <div className="flex flex-col items-end">
              <button
                onClick={() => {
                  if (!canCheckOut) return;
                  onClose();
                  if (onEdit) onEdit(slot);  // Triggers DebriefForm in ScheduleBoard
                }}
                disabled={!canCheckOut}
                title={canCheckOut ? undefined : `Check-out opens at ${formatIST(scheduledEnd.toISOString())} IST`}
                className={`px-4 py-2 text-sm rounded-lg transition ${
                  canCheckOut
                    ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 cursor-pointer'
                    : 'bg-[var(--surface-muted)] text-tertiary cursor-not-allowed'
                }`}
              >
                📝 Check-Out / Debrief
              </button>
              {!canCheckOut && (
                <p className="text-[10px] text-tertiary mt-1">Opens {formatIST(scheduledEnd.toISOString())} IST</p>
              )}
            </div>
          )}

          {/* ----- EDIT BUTTON ----- */}
          {/* Only for SCHEDULED flights → Opens BookingForm for editing */}
          {onEdit && slot.status === 'SCHEDULED' && (
            <button onClick={handleEdit} className="px-4 py-2 text-sm bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition cursor-pointer">
              ✏️ Edit
            </button>
          )}

         {/* ----- CANCEL FLIGHT BUTTON / REASON PICKER ----- */}
          {/* Hidden for COMPLETED and CANCELLED flights */}
          {slot.status !== 'COMPLETED' && slot.status !== 'CANCELLED' && !showCancelReason && (
            <button onClick={() => setShowCancelReason(true)} className="px-4 py-2 text-sm bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition cursor-pointer">
              Cancel Flight
            </button>
          )}
          {showCancelReason && (
            <div className="flex flex-wrap items-center gap-2 surface-inner rounded-lg px-3 py-2">
              <span className="text-xs text-tertiary">Cancel — reason?</span>
              <button onClick={() => handleCancel('WEATHER')} className="px-3 py-1.5 text-xs bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition cursor-pointer">
                🌧️ Weather
              </button>
              <button onClick={() => handleCancel('MAINTENANCE')} className="px-3 py-1.5 text-xs bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition cursor-pointer">
                🔧 Maintenance
              </button>
              <button onClick={() => handleCancel('OTHER')} className="px-3 py-1.5 text-xs bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition cursor-pointer">
                Other
              </button>
              <button onClick={() => setShowCancelReason(false)} className="px-3 py-1.5 text-xs surface-inner rounded-lg hover:opacity-80 transition cursor-pointer">
                Never mind
              </button>
            </div>
          )}

          {/* ----- PRINT BRIEF BUTTON ----- */}
          {/* Available for all statuses */}
          <button onClick={handlePrint} className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition cursor-pointer">
            📋 Print Brief
          </button>
        </div>
      </div>
    </div>
  );
}