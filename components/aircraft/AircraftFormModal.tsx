// components/aircraft/AircraftFormModal.tsx
'use client';

import { Aircraft } from '@/types';
import { useState, useEffect } from 'react';

interface Props {
  aircraft: Aircraft | null;
  onSave: (aircraft: Aircraft) => void;
  onClose: () => void;
}

export default function AircraftFormModal({ aircraft, onSave, onClose }: Props) {
  const isEditing = !!aircraft;
  
  const [form, setForm] = useState<Aircraft>({
    id: '',
    registration: '',
    type: '',
    model: '',
    year: new Date().getFullYear(),
    hobbsTime: 0,
    fuelCapacity: 200,
    currentFuel: 200,
    status: 'ACTIVE',
    nextMaintenance: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });

  useEffect(() => {
    if (aircraft) {
      setForm(aircraft);
    } else {
      setForm({
        id: 'ac' + Date.now(),
        registration: '',
        type: '',
        model: '',
        year: new Date().getFullYear(),
        hobbsTime: 0,
        fuelCapacity: 200,
        currentFuel: 200,
        status: 'ACTIVE',
        nextMaintenance: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      });
    }
  }, [aircraft]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
    onClose();
  };

const handleChange = (field: keyof Aircraft, value: string | number) => {
  if (field === 'hobbsTime' || field === 'year') {
    const num = parseFloat(value as string);
    setForm(prev => ({ ...prev, [field]: isNaN(num) ? 0 : num }));
  } else if (field === 'fuelCapacity' || field === 'currentFuel') {
    const num = parseInt(value as string);
    setForm(prev => ({ ...prev, [field]: isNaN(num) ? 0 : num }));
  } else {
    setForm(prev => ({ ...prev, [field]: value }));
  }
};

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-700 sticky top-0 bg-slate-800 rounded-t-xl">
          <h3 className="text-lg font-semibold text-white">
            {isEditing ? '✏️ Edit Aircraft' : '➕ Add New Aircraft'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg transition cursor-pointer">
            <span className="text-slate-400 text-xl">✕</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Registration */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Registration Number *</label>
            <input
              type="text"
              value={form.registration}
              onChange={e => handleChange('registration', e.target.value)}
              placeholder="e.g., N123AB"
              required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Type & Model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Type *</label>
              <select
                value={form.type}
                onChange={e => handleChange('type', e.target.value)}
                required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">Select Type</option>
                <option value="C172S">C172S</option>
                <option value="C152">C152</option>
                <option value="PA28">PA28</option>
                <option value="DA40">DA40</option>
                <option value="DA42">DA42</option>
                <option value="SR20">SR20</option>
                <option value="SR22">SR22</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Model *</label>
              <input
                type="text"
                value={form.model}
                onChange={e => handleChange('model', e.target.value)}
                placeholder="e.g., Cessna 172S Skyhawk"
                required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Year & Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Year</label>
              <input
                type="number"
                value={form.year || ''}
                onChange={e => handleChange('year', parseInt(e.target.value))}
                min={1970}
                max={new Date().getFullYear()}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => handleChange('status', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="ACTIVE">Active</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="GROUNDED">Grounded</option>
              </select>
            </div>
          </div>

          {/* Hobbs Time & Fuel Capacity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Hobbs Time (hrs)</label>
              <input
              type="number"
              value={form.hobbsTime || ''}
              onChange={e => handleChange('hobbsTime', e.target.value)}
              min={0}
              step="0.1"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Fuel Capacity (L)</label>
              <input
                type="number"
                value={form.fuelCapacity || ''}
                onChange={e => handleChange('fuelCapacity', parseInt(e.target.value))}
                min={50}
                step={10}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Current Fuel & Next Maintenance */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Current Fuel (L)</label>
              <input
                type="number"
                value={form.currentFuel || ''}
                onChange={e => handleChange('currentFuel', parseInt(e.target.value))}
                min={0}
                max={form.fuelCapacity}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Next Maintenance</label>
              <input
                type="date"
                value={form.nextMaintenance}
                onChange={e => handleChange('nextMaintenance', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Buttons */}
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
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition cursor-pointer"
            >
              {isEditing ? '💾 Save Changes' : '➕ Add Aircraft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}