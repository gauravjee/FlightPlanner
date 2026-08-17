// components/aircraft/AircraftFormModal.tsx
'use client';

import { Aircraft } from '@/types';
import { useState, useEffect } from 'react';
import { Pencil, Plus, Save, X } from 'lucide-react';
import { FUEL_BURN_RATE_BY_TYPE_LPH, DEFAULT_FUEL_BURN_RATE_LPH } from '@/lib/store';

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

  // Whether the Fuel Burn Rate field should keep auto-following the Type
  // dropdown's per-type default (FUEL_BURN_RATE_BY_TYPE_LPH). True for a new
  // aircraft (or one that's never had a rate set) until the user edits the
  // field by hand — at that point it becomes a deliberate per-aircraft
  // override and stops auto-updating when Type changes.
  const [autoBurnRate, setAutoBurnRate] = useState(!aircraft || aircraft.fuelBurnRateLph == null);

  useEffect(() => {
    if (aircraft) {
      setForm(aircraft);
      setAutoBurnRate(aircraft.fuelBurnRateLph == null);
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
      setAutoBurnRate(true);
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
  } else if (field === 'fuelBurnRateLph') {
    // A manual edit here (including clearing it back to empty) is a
    // deliberate per-aircraft override — stop auto-following Type from now on.
    setAutoBurnRate(false);
    const raw = value as string;
    const num = parseFloat(raw);
    setForm(prev => ({ ...prev, fuelBurnRateLph: raw === '' || isNaN(num) ? undefined : num }));
  } else if (field === 'type') {
    setForm(prev => ({
      ...prev,
      type: value as string,
      // Auto-fill (or refresh) the burn rate to this type's default, as long
      // as the user hasn't manually overridden it for this aircraft.
      fuelBurnRateLph: autoBurnRate
        ? (FUEL_BURN_RATE_BY_TYPE_LPH[value as string] ?? DEFAULT_FUEL_BURN_RATE_LPH)
        : prev.fuelBurnRateLph,
    }));
  } else {
    setForm(prev => ({ ...prev, [field]: value }));
  }
};

  const inputClass = "w-full surface-inner rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--accent)]";

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="surface-card w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b sticky top-0 rounded-t-xl" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            {isEditing ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {isEditing ? 'Edit Aircraft' : 'Add New Aircraft'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg transition cursor-pointer hover:opacity-80">
            <X className="w-5 h-5 text-tertiary" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Registration */}
          <div>
            <label className="block text-sm text-secondary mb-1">Registration Number *</label>
            <input
              type="text"
              value={form.registration}
              onChange={e => handleChange('registration', e.target.value)}
              placeholder="e.g., N123AB"
              required
              className={inputClass}
            />
          </div>

          {/* Type & Model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-secondary mb-1">Type *</label>
              <select
                value={form.type}
                onChange={e => handleChange('type', e.target.value)}
                required
                className={inputClass}
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
              <label className="block text-sm text-secondary mb-1">Model *</label>
              <input
                type="text"
                value={form.model}
                onChange={e => handleChange('model', e.target.value)}
                placeholder="e.g., Cessna 172S Skyhawk"
                required
                className={inputClass}
              />
            </div>
          </div>

          {/* Year & Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-secondary mb-1">Year</label>
              <input
                type="number"
                value={form.year || ''}
                onChange={e => handleChange('year', parseInt(e.target.value))}
                min={1970}
                max={new Date().getFullYear()}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => handleChange('status', e.target.value)}
                className={inputClass}
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
              <label className="block text-sm text-secondary mb-1">Hobbs Time (hrs)</label>
              <input
              type="number"
              value={form.hobbsTime || ''}
              onChange={e => handleChange('hobbsTime', e.target.value)}
              min={0}
              step="0.1"
              className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Fuel Capacity (L)</label>
              <input
                type="number"
                value={form.fuelCapacity || ''}
                onChange={e => handleChange('fuelCapacity', parseInt(e.target.value))}
                min={50}
                step={10}
                className={inputClass}
              />
            </div>
          </div>

          {/* Current Fuel & Next Maintenance */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-secondary mb-1">Current Fuel (L)</label>
              <input
                type="number"
                value={form.currentFuel || ''}
                onChange={e => handleChange('currentFuel', parseInt(e.target.value))}
                min={0}
                max={form.fuelCapacity}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Next Maintenance</label>
              <input
                type="date"
                value={form.nextMaintenance}
                onChange={e => handleChange('nextMaintenance', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Fuel Burn Rate */}
          <div>
            <label className="block text-sm text-secondary mb-1">Fuel Burn Rate (L/hr)</label>
            <input
              type="number"
              value={form.fuelBurnRateLph ?? ''}
              onChange={e => handleChange('fuelBurnRateLph', e.target.value)}
              placeholder={`${FUEL_BURN_RATE_BY_TYPE_LPH[form.type] ?? DEFAULT_FUEL_BURN_RATE_LPH} (type default)`}
              min={1}
              step="0.5"
              className={inputClass}
            />
            <p className="text-xs text-tertiary mt-1">
              Used to estimate fuel remaining when booking flights. Auto-fills from the selected
              Type&apos;s typical average when left blank — a rough planning estimate only, not a
              certified POH figure. Verify and adjust for your actual aircraft.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex space-x-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg transition cursor-pointer surface-inner"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 rounded-lg transition cursor-pointer font-semibold flex items-center justify-center gap-1.5"
              style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
            >
              {isEditing ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {isEditing ? 'Save Changes' : 'Add Aircraft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
