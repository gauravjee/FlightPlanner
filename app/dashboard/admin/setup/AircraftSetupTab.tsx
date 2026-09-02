// app/dashboard/admin/setup/AircraftSetupTab.tsx
// Quick aircraft fleet setup for new FTO installations
// Add multiple aircraft with registration, type, fuel capacity

'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase-client';
import { Plane, Pencil, Plus, Save, Trash2, CircleCheck, Fuel, Wrench } from 'lucide-react';
import { deriveModelEngineTypeMap } from '@/lib/store';
import {
  useAircraft,
  addAircraft as addAircraftRemote,
  updateAircraft as updateAircraftRemote,
  removeAircraft as removeAircraftRemote,
} from '@/lib/hooks/useAircraft';
import type { Aircraft as SharedAircraft } from '@/types';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

// ============================================================
// TYPE DEFINITIONS
// ============================================================
// This tab's own snake_case, DB-column-named shape for the aircraft list/
// form — kept as-is (rather than switched to the camelCase @/types
// Aircraft shape used everywhere else) to avoid a much larger unrelated
// rewrite of this file's form/table JSX, which reads/writes these exact
// field names throughout.
interface Aircraft {
  id: number;
  registration: string;
  type: string;
  model: string;
  year: number;
  hobbs_time: number;
  fuel_capacity: number;
  current_fuel: number;
  status: string;
  next_maintenance: string;
  is_simulator: boolean;
}

// 2026-08-19: `type` is the engine category, a genuinely fixed 2-value
// enum (not a DB-staleness situation like the old hardcoded model-code
// list this replaced — see restructure-aircraft-type-model.sql). The
// specific model/variant now goes in the free-text "Model" field below,
// e.g. "Cessna 172S Skyhawk".
const ENGINE_TYPES = ['Single Engine', 'Multi Engine'];

// 2026-08-26: sentinel for the "Other" option in the Model dropdown — see
// AircraftFormModal.tsx's own copy of this same pattern.
// 2026-08-27: picking "Other" now blocks Save instead of revealing free
// text — see AircraftFormModal.tsx's fuller comment on why, and the Model
// field JSX / handleSave check below.
const OTHER_MODEL_OPTION = '__other__';

// Default form values for adding a new aircraft. Pulled out into a function
// (rather than inlined into useState's initial value) so next_maintenance's
// Date.now()-based default is only ever computed lazily — on mount via
// useState(getDefaultForm), and on demand from resetForm() — instead of on
// every render, which is what a literal `new Date(Date.now() + ...)` inside
// useState's argument would do.
const getDefaultForm = () => ({
  registration: '',
  type: 'Single Engine',
  model: '',
  year: new Date().getFullYear(),
  hobbs_time: 0,
  fuel_capacity: 200,
  current_fuel: 200,
  status: 'ACTIVE',
  next_maintenance: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  is_simulator: false,
});

export default function AircraftSetupTab() {
  // 2026-08-28 (SWR migration, Stage 1): this tab used to run its own
  // independent `supabase.from('aircraft').select('*')` fetch here — a
  // second read path for the same table as app/dashboard/aircraft/page.tsx,
  // which had already drifted from the canonical @/types Aircraft shape
  // (this tab's own snake_case interface above has no fuel_burn_rate_lph
  // field at all). Reading now goes through the same lib/hooks/useAircraft
  // cache the main Aircraft page uses, so both stay in sync (an edit here
  // shows up there instantly, and vice versa) and there's exactly one place
  // the Supabase query for this table lives. The shared (camelCase) rows
  // are mapped below into this tab's own snake_case display shape rather
  // than rewriting this file's form/table JSX, which reads/writes those
  // field names throughout.
  const { aircraft: sharedAircraft, isLoading: loading } = useAircraft();
  const aircraft: Aircraft[] = sharedAircraft.map(a => ({
    id: Number(a.id),
    registration: a.registration,
    type: a.type,
    model: a.model,
    year: a.year,
    hobbs_time: a.hobbsTime,
    fuel_capacity: a.fuelCapacity,
    current_fuel: a.currentFuel,
    status: a.status,
    next_maintenance: a.nextMaintenance,
    is_simulator: !!a.isSimulator,
  }));
  const [editing, setEditing] = useState<Aircraft | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  // Form state for adding/editing
  const [form, setForm] = useState(getDefaultForm);

  // 2026-08-26: Aircraft Model dropdown — same pattern/source as
  // AircraftFormModal.tsx (distinct models from
  // aircraft_maintenance_schedule_templates, plus an "Other" free-text
  // fallback).
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [useCustomModel, setUseCustomModel] = useState(false);
  // 2026-08-27: model -> engine-type, derived from the query's engine_type
  // column — see deriveModelEngineTypeMap in lib/store.ts and the fuller
  // comment in AircraftFormModal.tsx's own copy of this same pattern.
  const [modelEngineType, setModelEngineType] = useState<Record<string, string>>({});

  // 2026-08-27: extracted so the "Refresh list" affordance below (shown
  // while blocked in Other/custom mode) can re-run this fetch on demand —
  // see AircraftFormModal.tsx's own copy of this same pattern.
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

  // 2026-08-27: Model dropdown filtered to whichever Type is currently
  // selected. A model not in the map (no engine_type set yet) is never
  // filtered out (shown for every Type).
  const filteredModelOptions = form.type
    ? modelOptions.filter(m => !modelEngineType[m] || modelEngineType[m] === form.type)
    : modelOptions;

  // Add or update aircraft
  const handleSave = async () => {
    if (!form.registration) {
      alert('Please enter a registration number.');
      return;
    }

    // 2026-08-27: a custom Model that doesn't match a schedule template
    // silently breaks Maintenance Due tracking for that aircraft (this is
    // exactly how a pre-existing aircraft's Due panel went blank) — block
    // saving here too, not just via the disabled submit button in
    // AircraftFormModal.tsx, since this tab's Save is a plain onClick
    // handler rather than a real <form> submit.
    if (useCustomModel && modelOptions.length > 0) {
      alert("This custom Model isn't in the Aircraft Maintenance Schedule yet. Add it via Admin Setup → Aircraft Maintenance Schedule first, then come back and pick it from the dropdown.");
      return;
    }

    // Check for duplicate registration
    const exists = aircraft.find(
      a => a.registration.toUpperCase() === form.registration.toUpperCase() &&
      (editing ? a.id !== editing.id : true)
    );
    if (exists) {
      alert('An aircraft with this registration already exists!');
      return;
    }

    // 2026-08-21 (security hardening round): this tab used to write
    // directly to Supabase from the browser — the same gap already fixed
    // for the main Aircraft page (see app/api/aircraft/route.ts). Field
    // names below are mapped to that route's camelCase body shape (this
    // tab's own form state uses snake_case, matching the DB column names
    // directly).
    // 2026-08-28 (SWR migration, Stage 1): now calls the same shared
    // addAircraft/updateAircraft write functions app/dashboard/aircraft/
    // page.tsx uses instead of a second, independent fetch('/api/aircraft')
    // call — those already hit this exact route and then splice the result
    // into the shared cache, so no manual reload is needed afterward.
    const payload: Partial<SharedAircraft> = {
      registration: form.registration.toUpperCase(),
      type: form.type,
      model: form.model,
      year: form.year,
      hobbsTime: form.hobbs_time,
      fuelCapacity: form.fuel_capacity,
      currentFuel: form.current_fuel,
      status: form.status as SharedAircraft['status'],
      nextMaintenance: form.next_maintenance,
      isSimulator: form.is_simulator,
    };

    if (editing) {
      await updateAircraftRemote(String(editing.id), payload);
      setSuccessMessage('Aircraft updated!');
    } else {
      await addAircraftRemote(payload as Omit<SharedAircraft, 'id'>);
      setSuccessMessage('Aircraft added!');
    }

    setTimeout(() => setSuccessMessage(''), 3000);
    setEditing(null);
    resetForm();
  };

  // Edit existing aircraft
  const handleEdit = (ac: Aircraft) => {
    setEditing(ac);
    setForm({
      registration: ac.registration,
      type: ac.type,
      model: ac.model,
      year: ac.year,
      hobbs_time: ac.hobbs_time,
      fuel_capacity: ac.fuel_capacity,
      current_fuel: ac.current_fuel,
      status: ac.status,
      next_maintenance: ac.next_maintenance,
      is_simulator: !!ac.is_simulator,
    });
    setUseCustomModel(!!ac.model && !modelOptions.includes(ac.model));
  };

  // Delete aircraft
  const handleDelete = (id: number) => {
    setDeleteTarget(id);
  };

  const handleDeleteConfirm = async () => {
    if (deleteTarget == null) return;
    const id = deleteTarget;
    setDeleteTarget(null);
    await removeAircraftRemote(String(id));
    setSuccessMessage('Aircraft removed.');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  // Reset form to defaults
  const resetForm = () => {
    setForm(getDefaultForm());
    setUseCustomModel(false);
  };

  // Stats
  const activeCount = aircraft.filter(a => a.status === 'ACTIVE').length;
  const maintenanceCount = aircraft.filter(a => a.status === 'MAINTENANCE').length;
  const totalFuel = aircraft.reduce((sum, a) => sum + a.current_fuel, 0);

  const inputClass = "w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]";

  return (
    <div className="surface-card p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Plane className="w-4 h-4 text-secondary" /> Aircraft Fleet Setup
      </h2>
      <p className="text-sm text-secondary mb-4">
        Quickly add your aircraft fleet. You can also manage aircraft later from the main Aircraft page.
      </p>

      {/* Success Message */}
      {successMessage && (
        <div className="rounded-lg p-3 mb-4 flex items-center gap-2" style={{ backgroundColor: 'var(--success-soft)', border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)' }}>
          <CircleCheck className="w-4 h-4" style={{ color: 'var(--success)' }} />
          <p className="text-sm" style={{ color: 'var(--success)' }}>{successMessage}</p>
        </div>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="surface-inner p-3 text-center">
          <p className="text-xs text-tertiary">Total Aircraft</p>
          <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{aircraft.length}</p>
        </div>
        <div className="surface-inner p-3 text-center">
          <p className="text-xs text-tertiary">Active</p>
          <p className="text-xl font-bold" style={{ color: 'var(--success)' }}>{activeCount}</p>
        </div>
        <div className="surface-inner p-3 text-center">
          <p className="text-xs text-tertiary">Maintenance</p>
          <p className="text-xl font-bold" style={{ color: 'var(--warning-text)' }}>{maintenanceCount}</p>
        </div>
        <div className="surface-inner p-3 text-center">
          <p className="text-xs text-tertiary">Total Fuel</p>
          <p className="text-xl font-bold" style={{ color: 'var(--accent)' }}>{totalFuel}L</p>
        </div>
      </div>

      {/* Add/Edit Form */}
      <div className="surface-inner p-4 mb-6">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
          {editing ? <><Pencil className="w-3.5 h-3.5" /> Edit {editing.registration}</> : <><Plus className="w-3.5 h-3.5" /> Add New Aircraft</>}
        </h3>

        {/* Row 1: Registration, Type, Model */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs text-tertiary mb-1">Registration *</label>
            <input
              type="text"
              placeholder="e.g., N123AB"
              value={form.registration}
              onChange={e => setForm(p => ({ ...p, registration: e.target.value.toUpperCase() }))}
              maxLength={10}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-tertiary mb-1">Type</label>
            <select
              value={form.type}
              onChange={e => {
                const newType = e.target.value;
                // Clear a now-mismatched Model, same as AircraftFormModal.tsx
                // — a known model belonging to the OTHER engine category
                // shouldn't be left sitting in the form once Type changes.
                setForm(p => ({
                  ...p,
                  type: newType,
                  model: (p.model && modelEngineType[p.model] && modelEngineType[p.model] !== newType) ? '' : p.model,
                }));
              }}
              className={inputClass}
            >
              {ENGINE_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-tertiary mb-1">Model</label>
            {useCustomModel ? (
              modelOptions.length > 0 ? (
                // 2026-08-27: no free-text input here anymore — see
                // handleSave's matching block for why Save is refused
                // while this state is showing.
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
                      onClick={() => setUseCustomModel(false)}
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
                // No schedule templates exist at all yet — fall back to
                // free text rather than blocking aircraft creation on an
                // empty table.
                <input
                  type="text"
                  placeholder="e.g., Cessna 172S Skyhawk"
                  value={form.model}
                  onChange={e => setForm(p => ({ ...p, model: e.target.value }))}
                  className={inputClass}
                />
              )
            ) : (
              <select
                value={form.model}
                onChange={e => {
                  if (e.target.value === OTHER_MODEL_OPTION) {
                    setUseCustomModel(true);
                    setForm(p => ({ ...p, model: '' }));
                  } else {
                    setForm(p => ({ ...p, model: e.target.value }));
                  }
                }}
                className={inputClass}
              >
                <option value="">Select Model</option>
                {filteredModelOptions.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
                <option value={OTHER_MODEL_OPTION}>Other (custom)…</option>
              </select>
            )}
            {!useCustomModel && modelOptions.length > 0 && filteredModelOptions.length === 0 && (
              <p className="text-xs text-tertiary mt-1">
                No known models for this Type yet — pick &quot;Other (custom)…&quot; or add one in Admin Setup → Aircraft Maintenance Schedule.
              </p>
            )}
          </div>
        </div>

        {/* Row 1b: Is Simulator — flag this entry as a flight simulator/
            training device rather than a real aircraft, so flights logged
            against it count toward Simulator Hours on the Progress page. */}
        <div className="mb-3">
          <label className="flex items-center gap-2 text-xs text-tertiary cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={form.is_simulator}
              onChange={e => setForm(p => ({ ...p, is_simulator: e.target.checked }))}
            />
            This is a flight simulator / training device (not a real aircraft)
          </label>
        </div>

        {/* Row 2: Year, Fuel Capacity, Current Fuel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs text-tertiary mb-1">Year</label>
            <input
              type="number"
              value={form.year}
              onChange={e => setForm(p => ({ ...p, year: parseInt(e.target.value) || 2024 }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-tertiary mb-1">Fuel Capacity (L)</label>
            <input
              type="number"
              value={form.fuel_capacity}
              onChange={e => setForm(p => ({ ...p, fuel_capacity: parseInt(e.target.value) || 0 }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-tertiary mb-1">Current Fuel (L)</label>
            <input
              type="number"
              value={form.current_fuel}
              onChange={e => setForm(p => ({ ...p, current_fuel: parseInt(e.target.value) || 0 }))}
              className={inputClass}
            />
          </div>
        </div>

        {/* Row 3: Hobbs, Status, Maintenance Date */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs text-tertiary mb-1">Hobbs Time (hrs)</label>
            <input
              type="number"
              step="0.1"
              value={form.hobbs_time}
              onChange={e => setForm(p => ({ ...p, hobbs_time: parseFloat(e.target.value) || 0 }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-tertiary mb-1">Status</label>
            <select
              value={form.status}
              onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
              className={inputClass}
            >
              <option value="ACTIVE">Active</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="GROUNDED">Grounded</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-tertiary mb-1">Next Maintenance</label>
            <input
              type="date"
              value={form.next_maintenance}
              onChange={e => setForm(p => ({ ...p, next_maintenance: e.target.value }))}
              className={inputClass}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2">
          <button
            onClick={handleSave}
            disabled={useCustomModel && modelOptions.length > 0}
            title={useCustomModel && modelOptions.length > 0 ? 'Add this model to Aircraft Maintenance Schedule first, then pick it from the dropdown.' : undefined}
            className="px-4 py-2 rounded-lg text-sm transition flex items-center gap-1.5 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
          >
            {editing ? <><Save className="w-3.5 h-3.5" /> Update Aircraft</> : <><Plus className="w-3.5 h-3.5" /> Add Aircraft</>}
          </button>
          {editing && (
            <button onClick={() => { setEditing(null); resetForm(); }}
              className="px-4 py-2 rounded-lg text-sm transition surface-inner">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Aircraft List */}
      {loading ? (
        <p className="text-secondary text-center py-4">Loading...</p>
      ) : aircraft.length === 0 ? (
        <div className="text-center py-8">
          <Plane className="w-8 h-8 mx-auto text-tertiary" />
          <p className="text-secondary mt-2">No aircraft in your fleet yet.</p>
          <p className="text-tertiary text-sm">Add your first aircraft above.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                <th className="pb-3">Reg</th>
                <th className="pb-3">Type</th>
                <th className="pb-3">Model</th>
                <th className="pb-3">Year</th>
                <th className="pb-3">Hobbs</th>
                <th className="pb-3">Fuel</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Mx Due</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="text-secondary">
              {aircraft.map(ac => (
                <tr key={ac.id} className="border-b" style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
                  <td className="py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{ac.registration}</td>
                  <td className="py-3">{ac.is_simulator ? 'Simulator' : ac.type}</td>
                  <td className="py-3 text-xs max-w-[150px] truncate">{ac.model || '—'}</td>
                  <td className="py-3">{ac.year}</td>
                  <td className="py-3">{ac.hobbs_time}h</td>
                  <td className="py-3 flex items-center gap-1"><Fuel className="w-3.5 h-3.5 text-tertiary" /> {ac.current_fuel}L / {ac.fuel_capacity}L</td>
                  <td className="py-3">
                    <span className={`badge ${
                      ac.status === 'ACTIVE' ? 'badge-success' :
                      ac.status === 'MAINTENANCE' ? 'badge-warning' :
                      'badge-danger'
                    }`}>
                      {ac.status === 'MAINTENANCE' && <Wrench className="w-3 h-3 mr-1 inline" />}
                      {ac.status}
                    </span>
                  </td>
                  <td className="py-3 text-xs">{ac.next_maintenance}</td>
                  <td className="py-3">
                    <button onClick={() => handleEdit(ac)} className="mr-2" style={{ color: 'var(--accent)' }} aria-label={`Edit ${ac.registration}`}><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(ac.id)} style={{ color: 'var(--danger)' }} aria-label={`Delete ${ac.registration}`}><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget != null && (
        <ConfirmDialog
          title="Delete aircraft?"
          message="Delete this aircraft? This cannot be undone."
          confirmLabel="Delete"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
