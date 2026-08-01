// components/maintenance/MaintenanceForm.tsx
// Modal form for adding/editing maintenance records
'use client';

import { useState, useEffect } from 'react';
import { useFlightStore } from '@/lib/store';
import { MaintenanceRecord } from '@/types';

interface Props {
  record: MaintenanceRecord | null;
  onSave: (record: Partial<MaintenanceRecord>) => void;
  onClose: () => void;
}

export default function MaintenanceForm({ record, onSave, onClose }: Props) {
  const { aircraft, loadAircraft } = useFlightStore();
  const isEditing = !!record;
  
  useEffect(() => {
    if (aircraft.length === 0) loadAircraft();
  }, []);
  
  const [form, setForm] = useState({
    aircraftId: record?.aircraftId || '',
    maintenanceType: record?.maintenanceType || '',
    description: record?.description || '',
    scheduledDate: record?.scheduledDate || new Date().toISOString().split('T')[0],
    completedDate: record?.completedDate || '',
    status: record?.status || 'SCHEDULED',
    cost: record?.cost || 0,
    performedBy: record?.performedBy || '',
    notes: record?.notes || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.aircraftId || !form.maintenanceType) return;
    onSave(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">
            {isEditing ? '✏️ Edit Maintenance' : '🔧 Log Maintenance'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg cursor-pointer">
            <span className="text-slate-400 text-xl">✕</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Aircraft *</label>
            <select value={form.aircraftId} onChange={e => setForm(p => ({ ...p, aircraftId: e.target.value }))} required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
              <option value="">Select Aircraft</option>
              {aircraft.map(a => (
                <option key={a.id} value={a.id}>{a.registration} ({a.type})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Type *</label>
              <select value={form.maintenanceType} onChange={e => setForm(p => ({ ...p, maintenanceType: e.target.value }))} required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
                <option value="">Select Type</option>
                <option value="50-Hour Inspection">50-Hour Inspection</option>
                <option value="100-Hour Inspection">100-Hour Inspection</option>
                <option value="Annual Inspection">Annual Inspection</option>
                <option value="AD Compliance">AD Compliance</option>
                <option value="Oil Change">Oil Change</option>
                <option value="Engine Overhaul">Engine Overhaul</option>
                <option value="Avionics Check">Avionics Check</option>
                <option value="Propeller Service">Propeller Service</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as MaintenanceRecord['status'] }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
                <option value="SCHEDULED">Scheduled</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Scheduled Date</label>
              <input type="date" value={form.scheduledDate} onChange={e => setForm(p => ({ ...p, scheduledDate: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Completed Date</label>
              <input type="date" value={form.completedDate} onChange={e => setForm(p => ({ ...p, completedDate: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Cost (₹)</label>
              <input type="number" value={form.cost || ''} onChange={e => setForm(p => ({ ...p, cost: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Performed By</label>
              <input type="text" value={form.performedBy} onChange={e => setForm(p => ({ ...p, performedBy: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={2} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
          </div>

          <div className="flex space-x-3 pt-4 border-t border-slate-700">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition cursor-pointer">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition cursor-pointer font-bold">
              {isEditing ? '💾 Save Changes' : '🔧 Log Maintenance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}