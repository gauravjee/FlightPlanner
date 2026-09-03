// components/aircraft/AircraftFormModal.tsx
'use client';

import { Aircraft } from '@/types';
import { useState, useEffect, useCallback } from 'react';
import { Pencil, Plus, Save, X } from 'lucide-react';
import { FUEL_BURN_RATE_BY_TYPE_LPH, DEFAULT_FUEL_BURN_RATE_LPH, deriveModelEngineTypeMap } from '@/lib/store';
import { useEscapeToClose } from '@/lib/useEscapeToClose';
import { supabase } from '@/lib/supabase-client';

// 2026-08-26: sentinel value for the "Other" option in the Model dropdown
// below — never written to form.model itself, only used to decide whether
// to show the "not in the schedule yet" warning state.
// 2026-08-27: picking "Other" no longer reveals a free-text input (see the
// Model field JSX below) — it blocks Save instead, pointing the admin at
// Aircraft Maintenance Schedule. A silently-mismatched Model is exactly how
// the Maintenance Due panel went blank for a pre-existing aircraft on
// 2026-08-27; this closes that gap at the point of entry instead of only
// catching it after the fact. The one exception is a genuinely empty
// schedule-template table (nothing to point anyone at yet) — see
// modelOptions.length checks below.
const OTHER_MODEL_OPTION = '__other__';

// 2026-08-19: `type` is the engine category, a genuinely fixed 2-value
// enum — see restructure-aircraft-type-model.sql. Previously this was a
// hardcoded, independently-drifted copy of AircraftSetupTab.tsx's own
// model-code list (7 codes here vs. 12 there — a real inconsistency this
// also fixes). The specific model/variant now belongs entirely to the
// free-text "Model" field below.
const ENGINE_TYPES = ['Single Engine', 'Multi Engine'];

interface Props {
  aircraft: Aircraft | null;
  onSave: (aircraft: Aircraft) => void;
  onClose: () => void;
}

export default function AircraftFormModal({ aircraft, onSave, onClose }: Props) {
  useEscapeToClose(onClose);
  const isEditing = !!aircraft;

  // The parent only ever renders this modal conditionally ({showForm &&
  // <AircraftFormModal .../>}), so `aircraft` is fixed for this instance's
  // whole lifetime — a fresh mount happens every time it's opened for a
  // different aircraft (or for Add New). That means the form can seed
  // straight from the prop in a lazy initializer instead of syncing it in
  // via an effect after the fact.
  const [form, setForm] = useState<Aircraft>(() =>
    aircraft
      ? { ...aircraft, isSimulator: !!aircraft.isSimulator }
      : {
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
          isSimulator: false,
        }
  );

  // Whether the Fuel Burn Rate field should keep auto-following the Type
  // dropdown's per-type default (FUEL_BURN_RATE_BY_TYPE_LPH). True for a new
  // aircraft (or one that's never had a rate set) until the user edits the
  // field by hand — at that point it becomes a deliberate per-aircraft
  // override and stops auto-updating when Type changes.
  const [autoBurnRate, setAutoBurnRate] = useState(!aircraft || aircraft.fuelBurnRateLph == null);

  // 2026-08-26: Aircraft Model dropdown, sourced from the distinct models
  // that have a maintenance schedule template defined (see
  // AircraftMaintenanceScheduleTab.tsx) — with an "Other" free-text
  // fallback for models with no template yet, per the confirmed design.
  // Read-only client-side query, same scope convention as every other
  // dropdown-source read in this app.
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  // Auto-detects once modelOptions has loaded whether the current
  // form.model matches a known option — but the user can flip it either
  // way afterward (the "Use list" link, or picking "Other" in the
  // dropdown), and that override sticks. null = no manual override yet,
  // so the computed default applies. Derived at render time instead of
  // synced via an effect (there's nothing to sync until modelOptions
  // itself finishes loading, at which point this just recomputes).
  const [customModelOverride, setCustomModelOverride] = useState<boolean | null>(null);
  const useCustomModel = customModelOverride ?? (modelOptions.length > 0 && !!form.model && !modelOptions.includes(form.model));
  // 2026-08-27: model -> engine-type ('Single Engine'/'Multi Engine'),
  // derived from the same query's engine_type column — see
  // deriveModelEngineTypeMap in lib/store.ts. A model with no engine_type
  // set on any of its rows just doesn't appear in this map.
  const [modelEngineType, setModelEngineType] = useState<Record<string, string>>({});

  // 2026-08-27: extracted so the "Refresh list" affordance below (shown
  // while blocked in Other/custom mode) can re-run this fetch on demand,
  // not just once on mount — lets someone add a model in Admin Setup →
  // Aircraft Maintenance Schedule (e.g. in another tab) and pick it up
  // here without having to close and reopen this whole form.
  const loadModelOptions = useCallback(() => {
    supabase
      .from('aircraft_maintenance_schedule_templates')
      .select('aircraft_model, engine_type')
      .then(({ data, error }) => {
        if (error) { console.error('Error loading aircraft models:', error.message); return; }
        const rows = (data || []) as { aircraft_model: string; engine_type: string | null }[];
        const distinct = Array.from(new Set(rows.map(r => r.aircraft_model))).sort();
        setModelOptions(distinct);
        setModelEngineType(deriveModelEngineTypeMap(rows));
      });
  }, []);

  useEffect(() => {
    loadModelOptions();
  }, [loadModelOptions]);

  // useCustomModel above is checked against the FULL model list (not the
  // type-filtered one below) so editing an existing aircraft whose Type and
  // Model happen to be a pre-existing mismatch (data predating this Type
  // filter) still shows it as a known list entry rather than forcing it
  // into "Other" mode.

  // 2026-08-27: Model dropdown filtered down to whichever Type is
  // currently selected (see modelEngineType, derived from the DB above) —
  // prevents picking a Single Engine Type with a twin-engine Model (or vice
  // versa) by manual-entry mistake. A model not present in modelEngineType
  // (no engine_type set yet) is deliberately never filtered out (shown for
  // every Type) rather than silently hidden. With no Type selected yet,
  // every option is shown — nothing to filter against.
  const filteredModelOptions = form.type
    ? modelOptions.filter(m => !modelEngineType[m] || modelEngineType[m] === form.type)
    : modelOptions;

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
    setForm(prev => {
      // If the currently-picked Model is known (in modelEngineType) and
      // belongs to a DIFFERENT engine category than the newly-selected
      // Type, clear it rather than silently leave a mismatched Type/Model
      // combo sitting in the form — the whole point of this filter is to
      // prevent exactly that combination from being saved. A model not in
      // the map (custom/unknown, or no engine_type set yet) is left alone,
      // since it isn't known to conflict with anything.
      const modelMismatch = prev.model && modelEngineType[prev.model] && modelEngineType[prev.model] !== value;
      return {
        ...prev,
        type: value as string,
        model: modelMismatch ? '' : prev.model,
        // Auto-fill (or refresh) the burn rate to this type's default, as long
        // as the user hasn't manually overridden it for this aircraft.
        fuelBurnRateLph: autoBurnRate
          ? (FUEL_BURN_RATE_BY_TYPE_LPH[value as string] ?? DEFAULT_FUEL_BURN_RATE_LPH)
          : prev.fuelBurnRateLph,
      };
    });
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
          <button onClick={onClose} className="p-2 rounded-lg transition cursor-pointer hover:opacity-80" aria-label="Close">
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
                {ENGINE_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Model *</label>
              {useCustomModel ? (
                modelOptions.length > 0 ? (
                  // 2026-08-27: no free-text input here anymore — a custom
                  // Model that doesn't match a schedule template silently
                  // breaks Maintenance Due tracking for that aircraft, so
                  // Save is blocked (see the submit button below) until the
                  // admin adds the model properly and picks it from the list.
                  <div className="space-y-2">
                    <div
                      className="text-xs rounded-lg px-3 py-2"
                      style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border)' }}
                    >
                      {form.model ? (
                        <>Current model on file, &quot;{form.model}&quot;, isn&apos;t in the Aircraft Maintenance Schedule yet. </>
                      ) : (
                        <>This model isn&apos;t in the Aircraft Maintenance Schedule yet. </>
                      )}
                      Add it via Admin Setup → Aircraft Maintenance Schedule, then come back and pick it from
                      the dropdown — a custom Model can no longer be typed in directly here.
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setCustomModelOverride(false)}
                        className="text-xs text-tertiary underline cursor-pointer"
                      >
                        Use list
                      </button>
                      <button
                        type="button"
                        onClick={loadModelOptions}
                        className="text-xs text-tertiary underline cursor-pointer"
                      >
                        Refresh list
                      </button>
                    </div>
                  </div>
                ) : (
                  // No schedule templates exist at all yet — nothing to
                  // point the admin at, so fall back to free text rather
                  // than blocking aircraft creation on an empty table.
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.model}
                      onChange={e => handleChange('model', e.target.value)}
                      placeholder="e.g., Cessna 172S Skyhawk"
                      required
                      className={inputClass}
                    />
                  </div>
                )
              ) : (
                <select
                  value={form.model}
                  onChange={e => {
                    if (e.target.value === OTHER_MODEL_OPTION) {
                      setCustomModelOverride(true);
                      handleChange('model', '');
                    } else {
                      handleChange('model', e.target.value);
                    }
                  }}
                  required
                  className={inputClass}
                >
                  <option value="">Select Model</option>
                  {filteredModelOptions.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  <option value={OTHER_MODEL_OPTION}>Other (custom)…</option>
                </select>
              )}
              {!useCustomModel && modelOptions.length === 0 && (
                <p className="text-xs text-tertiary mt-1">
                  No maintenance-schedule models defined yet — add one in Admin Setup → Aircraft Maintenance Schedule.
                </p>
              )}
              {!useCustomModel && modelOptions.length > 0 && filteredModelOptions.length === 0 && (
                <p className="text-xs text-tertiary mt-1">
                  No known models for this Type yet — pick &quot;Other (custom)…&quot; or add one in Admin Setup → Aircraft Maintenance Schedule.
                </p>
              )}
            </div>
          </div>

          {/* Is Simulator — flags this entry as a flight simulator/
              training device rather than a real aircraft, so flights
              logged against it count toward Simulator Hours on the
              Progress page instead of real flight time. */}
          <div>
            <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={!!form.isSimulator}
                onChange={e => setForm(prev => ({ ...prev, isSimulator: e.target.checked }))}
              />
              This is a flight simulator / training device (not a real aircraft)
            </label>
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
              disabled={useCustomModel && modelOptions.length > 0}
              title={useCustomModel && modelOptions.length > 0 ? 'Add this model to Aircraft Maintenance Schedule first, then pick it from the dropdown.' : undefined}
              className="flex-1 px-4 py-2 rounded-lg transition cursor-pointer font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
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
