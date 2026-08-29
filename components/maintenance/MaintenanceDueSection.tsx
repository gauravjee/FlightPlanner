// components/maintenance/MaintenanceDueSection.tsx
// Aircraft Maintenance Schedule — Phase 1 (2026-08-26)
//
// Non-blocking due/overdue warnings, computed client-side from
// useFlightStore().getMaintenanceDueItems() (see computeMaintenanceDueItems
// in lib/store.ts). Two staff-confirmed actions, both just create a
// COMPLETED maintenance_records row via the existing addMaintenanceRecord —
// there is no silent background auto-insert, per the scope simplification
// noted in the handoff doc:
//   - "Set Baseline": first-time entry for an item with no history yet
//     (NO_BASELINE status) — captures the current hobbs/date at last known
//     service so due-calculations have something to anchor to.
//   - "Log Completion": for a DUE_SOON/OVERDUE item — records that the
//     item was just done, resetting the due clock.
//
// Phase 2 (hard-blocking bookings on overdue mandatory items) is
// deliberately NOT built here — see add-aircraft-maintenance-schedule.sql.

'use client';

import { useState, useEffect } from 'react';
import { useFlightStore } from '@/lib/store';
import { useAircraft } from '@/lib/hooks/useAircraft';
import { MaintenanceDueItem } from '@/types';
import { TriangleAlert, Clock, CircleAlert, Wrench, X } from 'lucide-react';

interface LogModalProps {
  item: MaintenanceDueItem;
  aircraftReg: string;
  currentHobbs: number;
  mode: 'baseline' | 'complete';
  onClose: () => void;
}

function LogMaintenanceItemModal({ item, aircraftReg, currentHobbs, mode, onClose }: LogModalProps) {
  const addMaintenanceRecord = useFlightStore(s => s.addMaintenanceRecord);
  const todayLocal = new Date().toLocaleDateString('en-CA');
  const [completedDate, setCompletedDate] = useState(todayLocal);
  const [hobbs, setHobbs] = useState(String(currentHobbs));
  const [performedBy, setPerformedBy] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const inputClass = "w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]";

  const handleSave = async () => {
    setSaving(true);
    await addMaintenanceRecord({
      aircraftId: item.aircraftId,
      maintenanceType: item.template.itemName,
      description: mode === 'baseline'
        ? `Baseline entry for ${item.template.itemName} (schedule tracking enabled)`
        : item.template.itemName,
      scheduledDate: completedDate,
      completedDate,
      status: 'COMPLETED',
      cost: cost ? parseFloat(cost) : 0,
      performedBy,
      notes,
      maintenanceStart: null,
      maintenanceEnd: null,
      hobbsAtCompletion: item.template.intervalType === 'HOBBS_HOURS' && hobbs ? parseFloat(hobbs) : null,
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="surface-card w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Wrench className="w-4 h-4" />
            {mode === 'baseline' ? 'Set Baseline' : 'Log Completion'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg cursor-pointer hover:opacity-80" aria-label="Close">
            <X className="w-4 h-4 text-tertiary" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-secondary">
            {aircraftReg} — <span style={{ color: 'var(--text-primary)' }}>{item.template.itemName}</span>
          </p>
          {mode === 'baseline' && (
            <p className="text-xs text-tertiary">
              No maintenance history found for this item. Enter the {item.template.intervalType === 'HOBBS_HOURS' ? 'hobbs reading' : 'date'} at
              the last known service so future due dates can be calculated.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-secondary mb-1">
                {mode === 'baseline' ? 'Date of last service' : 'Completed Date'}
              </label>
              <input type="date" value={completedDate} onChange={e => setCompletedDate(e.target.value)} className={inputClass} />
            </div>
            {item.template.intervalType === 'HOBBS_HOURS' && (
              <div>
                <label className="block text-xs text-secondary mb-1">Hobbs at {mode === 'baseline' ? 'last service' : 'completion'}</label>
                <input type="number" step="0.1" value={hobbs} onChange={e => setHobbs(e.target.value)} className={inputClass} />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-secondary mb-1">Performed By</label>
              <input type="text" value={performedBy} onChange={e => setPerformedBy(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">Cost (₹)</label>
              <input type="number" value={cost} onChange={e => setCost(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-secondary mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={inputClass} />
          </div>
        </div>
        <div className="flex gap-3 p-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg transition cursor-pointer surface-inner">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg transition cursor-pointer font-semibold disabled:opacity-50"
            style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
          >
            {saving ? 'Saving…' : mode === 'baseline' ? 'Save Baseline' : 'Create Maintenance Record'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MaintenanceDueSection({ canWrite }: { canWrite: boolean }) {
  const { aircraft } = useAircraft();
  const {
    maintenanceScheduleTemplates, loadMaintenanceScheduleTemplates,
    getMaintenanceDueItems,
  } = useFlightStore();

  useEffect(() => {
    if (maintenanceScheduleTemplates.length === 0) loadMaintenanceScheduleTemplates();
  }, [maintenanceScheduleTemplates.length, loadMaintenanceScheduleTemplates]);

  const [modalState, setModalState] = useState<{ item: MaintenanceDueItem; mode: 'baseline' | 'complete' } | null>(null);

  // One row per (aircraft, active template item) that has a template
  // matching its model — computed fresh each render from the store, same
  // "pure function over current state" pattern as getSchedulingBlockReason.
  const allDueItems = aircraft.flatMap(ac => getMaintenanceDueItems(ac));

  const attention = allDueItems.filter(i => i.status !== 'OK');
  if (attention.length === 0) return null;

  const statusMeta: Record<MaintenanceDueItem['status'], { icon: typeof TriangleAlert; color: string; label: string }> = {
    OVERDUE: { icon: TriangleAlert, color: 'var(--danger)', label: 'Overdue' },
    DUE_SOON: { icon: Clock, color: 'var(--warning-text)', label: 'Due soon' },
    NO_BASELINE: { icon: CircleAlert, color: 'var(--text-tertiary)', label: 'No baseline' },
    OK: { icon: Clock, color: 'var(--success)', label: 'OK' },
  };

  // Overdue first, then due soon, then no-baseline.
  const order: MaintenanceDueItem['status'][] = ['OVERDUE', 'DUE_SOON', 'NO_BASELINE'];
  const sorted = [...attention].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));

  return (
    <div className="surface-card p-6 mb-6">
      <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
        <Wrench className="w-4 h-4 text-secondary" /> Maintenance Due
      </h2>
      <p className="text-sm text-secondary mb-4">
        Based on schedule items defined in Admin Setup → Aircraft Maintenance Schedule. Warnings only — does not block scheduling.
      </p>
      <div className="space-y-2">
        {sorted.map((item, idx) => {
          const ac = aircraft.find(a => String(a.id) === item.aircraftId);
          const meta = statusMeta[item.status];
          const Icon = meta.icon;
          return (
            <div
              key={`${item.aircraftId}-${item.template.id}-${idx}`}
              className="flex items-center justify-between gap-3 p-3 rounded-lg flex-wrap"
              style={{ backgroundColor: 'var(--surface-muted)' }}
            >
              <div className="flex items-center gap-2 text-sm">
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: meta.color }} />
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{ac?.registration || '—'}</span>
                <span className="text-secondary">{item.template.itemName}</span>
                <span className="badge" style={{ backgroundColor: 'color-mix(in srgb, ' + meta.color + ' 18%, transparent)', color: meta.color }}>
                  {meta.label}
                </span>
                {item.status === 'OVERDUE' && item.template.intervalType === 'HOBBS_HOURS' && item.dueAtHobbs != null && ac && (
                  <span className="text-xs text-tertiary">
                    due at {item.dueAtHobbs}h (current {ac.hobbsTime}h)
                  </span>
                )}
                {item.status === 'OVERDUE' && item.template.intervalType === 'CALENDAR_MONTHS' && item.dueAtDate && (
                  <span className="text-xs text-tertiary">due {new Date(item.dueAtDate).toLocaleDateString('en-IN')}</span>
                )}
              </div>
              {canWrite && ac && (
                <button
                  onClick={() => setModalState({ item, mode: item.status === 'NO_BASELINE' ? 'baseline' : 'complete' })}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                  style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                >
                  {item.status === 'NO_BASELINE' ? 'Set Baseline' : 'Create Maintenance Record'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {modalState && (() => {
        const ac = aircraft.find(a => String(a.id) === modalState.item.aircraftId);
        return (
          <LogMaintenanceItemModal
            item={modalState.item}
            aircraftReg={ac?.registration || ''}
            currentHobbs={ac?.hobbsTime || 0}
            mode={modalState.mode}
            onClose={() => setModalState(null)}
          />
        );
      })()}
    </div>
  );
}
