// components/maintenance/MaintenanceForm.tsx
// Modal form for adding/editing maintenance records
'use client';

import { useState, useMemo } from 'react';
import { useAircraft } from '@/lib/hooks/useAircraft';
import { useInstructors } from '@/lib/hooks/useInstructors';
import { useStudents } from '@/lib/hooks/useStudents';
import { useScheduledFlights } from '@/lib/hooks/useScheduledFlights';
import { MaintenanceRecord } from '@/types';
import { Pencil, Wrench, X, Hourglass, TriangleAlert } from 'lucide-react';
import { useEscapeToClose } from '@/lib/useEscapeToClose';

interface Props {
  record: MaintenanceRecord | null;
  onSave: (record: Partial<MaintenanceRecord>) => void;
  onClose: () => void;
}

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const pad2 = (n: number): string => String(n).padStart(2, '0');

// Split a stored maintenanceStart/End ISO (UTC) timestamp back into the IST
// date/hour/minute pieces the form's dropdowns use. Minutes are rounded to
// the nearest quarter-hour so they always match one of the dropdown options,
// even if the stored value came from somewhere else with finer precision.
const isoToISTParts = (iso: string) => {
  const d = new Date(iso);
  const shifted = new Date(d.getTime() + IST_OFFSET_MS);
  const date = shifted.toISOString().slice(0, 10);
  let hour = shifted.getUTCHours();
  let minute = Math.round(shifted.getUTCMinutes() / 15) * 15;
  if (minute === 60) { minute = 0; hour = (hour + 1) % 24; }
  return { date, hour: pad2(hour), minute: pad2(minute) };
};

// Build a UTC ISO timestamp from IST date/hour/minute pieces — same
// "+05:30" convention BookingForm already uses when saving flight times, so
// maintenance windows and flight bookings compare correctly against each
// other (both stored as real UTC instants).
const buildISTIso = (date: string, hour: string, minute: string): string =>
  new Date(`${date}T${hour}:${minute}:00+05:30`).toISOString();

export default function MaintenanceForm({ record, onSave, onClose }: Props) {
  useEscapeToClose(onClose);
  const { aircraft } = useAircraft();
  const { instructors } = useInstructors();
  const { students } = useStudents();
  // Instructors, Students, and now Scheduled Flights are all SWR-migrated
  // (Stages 2, 3, 5) and fetch themselves on mount — no manual load needed.
  const { scheduledFlights } = useScheduledFlights();
  const isEditing = !!record;

  const todayLocal = new Date().toLocaleDateString('en-CA');

  // Existing record's precise window (if any) split into the form's pieces.
  const existingStart = record?.maintenanceStart ? isoToISTParts(record.maintenanceStart) : null;
  const existingEnd = record?.maintenanceEnd ? isoToISTParts(record.maintenanceEnd) : null;

  const [form, setForm] = useState({
    aircraftId: record?.aircraftId || '',
    maintenanceType: record?.maintenanceType || '',
    description: record?.description || '',
    scheduledDate: record?.scheduledDate || todayLocal,
    completedDate: record?.completedDate || '',
    status: record?.status || 'SCHEDULED',
    cost: record?.cost || 0,
    performedBy: record?.performedBy || '',
    notes: record?.notes || '',
    // 2026-08-26: aircraft maintenance schedule, Phase 1 — hobbs reading at
    // completion, needed for HOBBS_HOURS-interval items (Oil Change,
    // 100-Hour Inspection, Engine Overhaul, etc.) to be tracked when logged
    // through this normal form rather than the Maintenance Due panel's own
    // "Create Maintenance Record" action. Optional — omitting it just means
    // this completion won't reset that item's due clock.
    hobbsAtCompletion: record?.hobbsAtCompletion != null ? String(record.hobbsAtCompletion) : '',
    // Precise window — off by default (blocks the whole Scheduled Date, the
    // original/simple behavior). Turning it on reveals Start/End pickers.
    usePreciseWindow: !!record?.maintenanceStart,
    startDate: existingStart?.date || record?.scheduledDate || todayLocal,
    startHour: existingStart?.hour || '',
    startMinute: existingStart?.minute || '00',
    // Open-ended = no known finish yet (emergency / mid-repair). Only
    // meaningful when usePreciseWindow is on.
    openEnded: !!record?.maintenanceStart && !record?.maintenanceEnd,
    endDate: existingEnd?.date || existingStart?.date || record?.scheduledDate || todayLocal,
    endHour: existingEnd?.hour || '',
    endMinute: existingEnd?.minute || '00',
  });

  const [error, setError] = useState('');

  // Live-computed duration shown under the End pickers — never entered
  // directly, always derived from Start/End so it can't drift out of sync.
  const duration = useMemo(() => {
    if (!form.usePreciseWindow || !form.startHour) return null;
    if (form.openEnded) return { openEnded: true as const };
    if (!form.endHour) return null;
    const start = new Date(`${form.startDate}T${form.startHour}:${form.startMinute}:00+05:30`);
    const end = new Date(`${form.endDate}T${form.endHour}:${form.endMinute}:00+05:30`);
    const ms = end.getTime() - start.getTime();
    if (ms <= 0) return { invalid: true as const };
    const totalMin = Math.round(ms / 60000);
    return {
      invalid: false as const,
      days: Math.floor(totalMin / 1440),
      hours: Math.floor((totalMin % 1440) / 60),
      mins: totalMin % 60,
    };
  }, [form.usePreciseWindow, form.openEnded, form.startDate, form.startHour, form.startMinute, form.endDate, form.endHour, form.endMinute]);

  // Existing bookings this window would conflict with — shown as a warning,
  // never blocks saving. Whoever's logging the maintenance needs to see this
  // so they can go reassign or cancel the flight themselves; the tool
  // shouldn't silently touch someone else's booking.
  const conflicts = useMemo(() => {
    if (!form.usePreciseWindow || !form.aircraftId || !form.startHour) return [];
    const mStart = new Date(`${form.startDate}T${form.startHour}:${form.startMinute}:00+05:30`);
    const mEnd = form.openEnded || !form.endHour
      ? null
      : new Date(`${form.endDate}T${form.endHour}:${form.endMinute}:00+05:30`);
    if (mEnd && mEnd <= mStart) return [];
    const farFuture = new Date(8640000000000000);
    return scheduledFlights.filter(f => {
      if (String(f.aircraftId) !== String(form.aircraftId)) return false;
      if (f.status === 'CANCELLED' || f.status === 'COMPLETED') return false;
      const fStart = new Date(f.startTime);
      const fEnd = new Date(f.endTime);
      return fStart < (mEnd || farFuture) && fEnd > mStart;
    });
  }, [form.usePreciseWindow, form.aircraftId, form.startDate, form.startHour, form.startMinute, form.openEnded, form.endDate, form.endHour, form.endMinute, scheduledFlights]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.aircraftId || !form.maintenanceType) return;
    if (form.usePreciseWindow && !form.startHour) {
      setError('Pick a Start Hour, or turn off the time window to block the whole Scheduled Date instead.');
      return;
    }
    if (form.usePreciseWindow && !form.openEnded) {
      if (!form.endHour) {
        setError('Pick an End Hour, or check "Open-ended" if the finish time isn\'t known yet.');
        return;
      }
      if (duration && duration.invalid) {
        setError('End must be after Start.');
        return;
      }
    }

    onSave({
      aircraftId: form.aircraftId,
      maintenanceType: form.maintenanceType,
      description: form.description,
      scheduledDate: form.scheduledDate,
      completedDate: form.completedDate || null,
      status: form.status as MaintenanceRecord['status'],
      cost: form.cost,
      performedBy: form.performedBy,
      notes: form.notes,
      maintenanceStart: form.usePreciseWindow ? buildISTIso(form.startDate, form.startHour, form.startMinute) : null,
      maintenanceEnd: form.usePreciseWindow && !form.openEnded ? buildISTIso(form.endDate, form.endHour, form.endMinute) : null,
      hobbsAtCompletion: form.hobbsAtCompletion ? parseFloat(form.hobbsAtCompletion) : null,
    });
    onClose();
  };

  const HOURS_24 = Array.from({ length: 24 }, (_, h) => pad2(h));
  const MINUTES_4 = ['00', '15', '30', '45'];
  const inputClass = "w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]";

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="surface-card w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b sticky top-0 z-10" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            {isEditing ? <Pencil className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
            {isEditing ? 'Edit Maintenance' : 'Log Maintenance'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg cursor-pointer hover:opacity-80" aria-label="Close">
            <X className="w-5 h-5 text-tertiary" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-xs text-secondary mb-1">Aircraft *</label>
            <select value={form.aircraftId} onChange={e => setForm(p => ({ ...p, aircraftId: e.target.value }))} required
              className={inputClass}>
              <option value="">Select Aircraft</option>
              {aircraft.map(a => (
                <option key={a.id} value={a.id}>{a.registration} ({a.type})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-secondary mb-1">Type *</label>
              <select value={form.maintenanceType} onChange={e => setForm(p => ({ ...p, maintenanceType: e.target.value }))} required
                className={inputClass}>
                <option value="">Select Type</option>
                <option value="50-Hour Inspection">50-Hour Inspection</option>
                <option value="100-Hour Inspection">100-Hour Inspection</option>
                <option value="Annual Inspection">Annual Inspection</option>
                <option value="AD Compliance">AD Compliance</option>
                <option value="Oil Change">Oil Change</option>
                <option value="Engine Overhaul">Engine Overhaul</option>
                <option value="Avionics Check">Avionics Check</option>
                <option value="Propeller Service">Propeller Service</option>
                <option value="Emergency / AOG">Emergency / AOG</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as MaintenanceRecord['status'] }))}
                className={inputClass}>
                <option value="SCHEDULED">Scheduled</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-secondary mb-1">Scheduled Date</label>
              <input type="date" value={form.scheduledDate} onChange={e => setForm(p => ({ ...p, scheduledDate: e.target.value }))}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">Completed Date</label>
              <input type="date" value={form.completedDate} onChange={e => setForm(p => ({ ...p, completedDate: e.target.value }))}
                className={inputClass} />
            </div>
          </div>

          {/* 2026-08-26: only meaningful once the record is actually
              completed — feeds the Aircraft Maintenance Schedule's due
              tracking (see MaintenanceDueSection.tsx) for HOBBS_HOURS
              items like Oil Change / 100-Hour Inspection / Engine
              Overhaul, when logged here instead of via that panel's own
              action. */}
          {form.status === 'COMPLETED' && (
            <div>
              <label className="block text-xs text-secondary mb-1">
                Hobbs at Completion <span className="text-tertiary">(for maintenance-schedule tracking)</span>
              </label>
              <input type="number" step="0.1" placeholder="e.g., 1245.3" value={form.hobbsAtCompletion}
                onChange={e => setForm(p => ({ ...p, hobbsAtCompletion: e.target.value }))}
                className={inputClass} />
            </div>
          )}

          {/* Precise maintenance window — off by default (blocks the whole
              Scheduled Date, unchanged original behavior). Turning it on
              lets you block only the actual hours the aircraft is out of
              service, across as many days as the job takes. */}
          <div className="rounded-lg p-3 space-y-3" style={{ border: '1px solid var(--border)' }}>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input type="checkbox" checked={form.usePreciseWindow}
                onChange={e => setForm(p => ({ ...p, usePreciseWindow: e.target.checked }))}
                className="w-4 h-4" />
              <span className="text-sm font-medium">Block a specific time window (instead of the whole day)</span>
            </label>

            {form.usePreciseWindow && (
              <>
                <div>
                  <p className="text-xs text-tertiary mb-1">Start</p>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                      className={`${inputClass} px-2 py-2`} />
                    <select value={form.startHour} onChange={e => setForm(p => ({ ...p, startHour: e.target.value }))}
                      className={`${inputClass} px-2 py-2`}>
                      <option value="">Hour</option>
                      {HOURS_24.map(h => <option key={h} value={h}>{h}:00</option>)}
                    </select>
                    <select value={form.startMinute} onChange={e => setForm(p => ({ ...p, startMinute: e.target.value }))}
                      className={`${inputClass} px-2 py-2`}>
                      {MINUTES_4.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" checked={form.openEnded}
                    onChange={e => setForm(p => ({ ...p, openEnded: e.target.checked }))}
                    className="w-4 h-4" />
                  <span className="text-xs text-secondary">Open-ended — finish time not known yet (emergency / still in progress)</span>
                </label>

                {!form.openEnded && (
                  <div>
                    <p className="text-xs text-tertiary mb-1">End</p>
                    <div className="grid grid-cols-3 gap-2">
                      <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                        className={`${inputClass} px-2 py-2`} />
                      <select value={form.endHour} onChange={e => setForm(p => ({ ...p, endHour: e.target.value }))}
                        className={`${inputClass} px-2 py-2`}>
                        <option value="">Hour</option>
                        {HOURS_24.map(h => <option key={h} value={h}>{h}:00</option>)}
                      </select>
                      <select value={form.endMinute} onChange={e => setForm(p => ({ ...p, endMinute: e.target.value }))}
                        className={`${inputClass} px-2 py-2`}>
                        {MINUTES_4.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {/* Duration — always computed from Start/End, never entered directly */}
                {duration && (
                  <p className="text-xs flex items-center gap-1" style={{ color: duration.invalid ? 'var(--danger)' : 'var(--text-secondary)' }}>
                    {duration.openEnded
                      ? <><Hourglass className="w-3 h-3 flex-shrink-0" /> Open-ended — will keep blocking the aircraft until an end time is set or the record is marked Completed.</>
                      : duration.invalid
                        ? 'End must be after Start.'
                        : `Duration: ${duration.days ? `${duration.days}d ` : ''}${duration.hours}h ${duration.mins}m`}
                  </p>
                )}

                {conflicts.length > 0 && (
                  <div className="rounded-lg p-2 space-y-1" style={{ backgroundColor: 'var(--danger-soft)', border: '1px solid color-mix(in srgb, var(--danger) 50%, transparent)' }}>
                    <p className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--danger)' }}>
                      <TriangleAlert className="w-3.5 h-3.5 flex-shrink-0" /> Conflicts with {conflicts.length} existing booking{conflicts.length > 1 ? 's' : ''} — you&apos;ll need to reassign or cancel {conflicts.length > 1 ? 'these' : 'it'} yourself:
                    </p>
                    {conflicts.map(f => {
                      const student = f.studentId ? students.find(s => s.id === f.studentId) : undefined;
                      const instructor = instructors.find(i => i.id === f.instructorId);
                      return (
                        <p key={f.id} className="text-[11px]" style={{ color: 'var(--danger)' }}>
                          {new Date(f.startTime).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} —{' '}
                          {student?.name || f.studentName || 'No Student'} / {instructor?.name || 'No Instructor'}
                        </p>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-secondary mb-1">Cost (₹)</label>
              <input type="number" value={form.cost || ''} onChange={e => setForm(p => ({ ...p, cost: parseFloat(e.target.value) || 0 }))}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">Performed By</label>
              <input type="text" value={form.performedBy} onChange={e => setForm(p => ({ ...p, performedBy: e.target.value }))}
                className={inputClass} />
            </div>
          </div>

          <div>
            <label className="block text-xs text-secondary mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2} className={inputClass} />
          </div>

          <div>
            <label className="block text-xs text-secondary mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={2} className={inputClass} />
          </div>

          <div className="flex space-x-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg transition cursor-pointer surface-inner">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 px-4 py-2 rounded-lg transition cursor-pointer font-semibold flex items-center justify-center gap-1.5"
              style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}>
              {isEditing ? <Pencil className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
              {isEditing ? 'Save Changes' : 'Log Maintenance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
