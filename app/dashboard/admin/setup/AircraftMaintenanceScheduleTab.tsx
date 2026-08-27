// app/dashboard/admin/setup/AircraftMaintenanceScheduleTab.tsx
// Manage the recurring maintenance schedule templates (Phase 1, 2026-08-26)
// per aircraft model — engine TBO, annual/100-hour-style inspections, etc.
//
// This is the source list an aircraft's Model field is chosen from (see
// AircraftFormModal.tsx / AircraftSetupTab.tsx) and what
// computeMaintenanceDueItems() in lib/store.ts reads to work out
// due/overdue status per aircraft. Phase 1 scope only: warnings, no
// scheduling block — see add-aircraft-maintenance-schedule.sql's header.
//
// Modeled directly on RequirementsTab.tsx's "grouped by parent selector"
// pattern (program_code selector -> aircraft_model selector here).

'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase-client';
import { Wrench, Pencil, Plus, Save, Trash2 } from 'lucide-react';

interface ScheduleTemplateRow {
  id: number;
  aircraft_model: string;
  item_name: string;
  interval_type: 'HOBBS_HOURS' | 'CALENDAR_MONTHS';
  interval_value: number;
  notes: string | null;
  is_active: boolean;
}

// Seeded models (see add-aircraft-maintenance-schedule.sql) plus whatever
// custom models a user has already added templates for — the model list
// below is a starting point, not a hard whitelist; typing a new name in
// the form creates a new model group.
const SEED_MODELS = [
  'Cessna 172',
  'Tecnam P2006T',
  'Piper PA-34 Seneca',
  'Diamond DA42 / DA42 NG',
  'Piper PA-44 Seminole',
];

export default function AircraftMaintenanceScheduleTab() {
  const [templates, setTemplates] = useState<ScheduleTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState(SEED_MODELS[0]);
  const [customModel, setCustomModel] = useState('');
  const [editing, setEditing] = useState<ScheduleTemplateRow | null>(null);
  const [form, setForm] = useState({
    item_name: '',
    interval_type: 'HOBBS_HOURS' as 'HOBBS_HOURS' | 'CALENDAR_MONTHS',
    interval_value: 100,
    notes: '',
    is_active: true,
  });

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('aircraft_maintenance_schedule_templates')
      .select('*')
      .order('aircraft_model', { ascending: true })
      .order('item_name', { ascending: true });
    if (error) {
      console.error('Error loading maintenance schedule templates:', error.message);
    } else {
      setTemplates(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // Every distinct model that already has at least one template row, plus
  // the seed list — so a model added purely via the Aircraft form's
  // "Other" fallback still shows up here once someone starts scheduling
  // it, and vice versa.
  const knownModels = Array.from(new Set([...SEED_MODELS, ...templates.map(t => t.aircraft_model)]));

  const rowsForModel = templates.filter(t => t.aircraft_model === selectedModel);

  const resetForm = () => {
    setEditing(null);
    setForm({ item_name: '', interval_type: 'HOBBS_HOURS', interval_value: 100, notes: '', is_active: true });
  };

  const handleSave = async () => {
    if (!form.item_name || !selectedModel) return;

    const body = { aircraft_model: selectedModel, ...form };

    if (editing) {
      await fetch('/api/admin/config/aircraft-maintenance-schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, ...body }),
      });
    } else {
      await fetch('/api/admin/config/aircraft-maintenance-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    resetForm();
    loadTemplates();
  };

  const handleEdit = (row: ScheduleTemplateRow) => {
    setEditing(row);
    setForm({
      item_name: row.item_name,
      interval_type: row.interval_type,
      interval_value: row.interval_value,
      notes: row.notes || '',
      is_active: row.is_active,
    });
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Delete this maintenance schedule item? Existing maintenance records referencing it are not affected.')) {
      await fetch(`/api/admin/config/aircraft-maintenance-schedule?id=${id}`, { method: 'DELETE' });
      loadTemplates();
    }
  };

  const handleAddModel = () => {
    const name = customModel.trim();
    if (!name) return;
    setSelectedModel(name);
    setCustomModel('');
    resetForm();
  };

  const inputClass = "w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]";

  return (
    <div className="surface-card p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Wrench className="w-4 h-4 text-secondary" /> Aircraft Maintenance Schedule
      </h2>
      <p className="text-sm text-secondary mb-4">
        Define recurring maintenance items (engine overhaul, inspections, etc.) per aircraft model.
        These populate the Aircraft Model dropdown and drive due/overdue warnings on the Maintenance page
        (Phase 1: warnings only — this does not block scheduling).
      </p>

      {/* Model Selector */}
      <div className="mb-6">
        <label className="block text-sm text-secondary mb-2">Select Aircraft Model:</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {knownModels.map(model => (
            <button
              key={model}
              onClick={() => { setSelectedModel(model); resetForm(); }}
              className="px-4 py-2 rounded-lg text-sm transition"
              style={
                selectedModel === model
                  ? { backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a', fontWeight: 500 }
                  : { backgroundColor: 'var(--surface-muted)', color: 'var(--text-secondary)' }
              }
            >
              {model}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Add a new model…"
            value={customModel}
            onChange={e => setCustomModel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddModel(); }}
            className={`${inputClass} max-w-xs`}
          />
          <button
            onClick={handleAddModel}
            disabled={!customModel.trim()}
            className="px-3 py-2 rounded-lg text-sm transition surface-inner disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Model
          </button>
        </div>
      </div>

      {/* Add/Edit Form */}
      <div className="surface-inner p-4 mb-6">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
          {editing ? <><Pencil className="w-3.5 h-3.5" /> Edit Schedule Item</> : <><Plus className="w-3.5 h-3.5" /> Add Schedule Item for {selectedModel}</>}
        </h3>

        <div className="mb-3">
          <label className="block text-xs text-tertiary mb-1">Item Name *</label>
          <input
            type="text"
            placeholder="e.g., Engine overhaul (TBO)"
            value={form.item_name}
            onChange={e => setForm(p => ({ ...p, item_name: e.target.value }))}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-tertiary mb-1">Interval Type</label>
            <select
              value={form.interval_type}
              onChange={e => setForm(p => ({ ...p, interval_type: e.target.value as 'HOBBS_HOURS' | 'CALENDAR_MONTHS' }))}
              className={inputClass}
            >
              <option value="HOBBS_HOURS">Hobbs Hours</option>
              <option value="CALENDAR_MONTHS">Calendar Months</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-tertiary mb-1">
              Interval ({form.interval_type === 'HOBBS_HOURS' ? 'hours' : 'months'})
            </label>
            <input
              type="number"
              min={1}
              value={form.interval_value}
              onChange={e => setForm(p => ({ ...p, interval_value: parseFloat(e.target.value) || 0 }))}
              className={inputClass}
            />
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-xs text-tertiary mb-1">Notes (source/caveat)</label>
          <input
            type="text"
            placeholder="e.g., Manufacturer TBO — confirm against operator's approved CAMP"
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            className={inputClass}
          />
        </div>

        <div className="mb-3 flex items-center space-x-2">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}
            className="w-4 h-4"
          />
          <label className="text-sm text-secondary">Active (included in due-status calculations)</label>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm transition flex items-center gap-1.5 font-semibold"
            style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
          >
            {editing ? <><Save className="w-3.5 h-3.5" /> Update Item</> : <><Plus className="w-3.5 h-3.5" /> Add Item</>}
          </button>
          {editing && (
            <button onClick={resetForm} className="px-4 py-2 rounded-lg text-sm transition surface-inner">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Schedule Items List */}
      {loading ? (
        <p className="text-secondary text-center py-4">Loading...</p>
      ) : rowsForModel.length === 0 ? (
        <p className="text-secondary text-center py-4">
          No schedule items defined for {selectedModel}. Add your first one above.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                <th className="pb-3">Item</th>
                <th className="pb-3">Interval</th>
                <th className="pb-3">Notes</th>
                <th className="pb-3">Active</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="text-secondary">
              {rowsForModel.map(row => (
                <tr key={row.id} className="border-b" style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
                  <td className="py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{row.item_name}</td>
                  <td className="py-3 text-xs">
                    {row.interval_value} {row.interval_type === 'HOBBS_HOURS' ? 'hrs' : 'mo'}
                  </td>
                  <td className="py-3 text-xs max-w-xs truncate" title={row.notes || ''}>{row.notes || '—'}</td>
                  <td className="py-3">
                    {row.is_active ? (
                      <span style={{ color: 'var(--success)' }}>Yes</span>
                    ) : (
                      <span className="text-tertiary">No</span>
                    )}
                  </td>
                  <td className="py-3">
                    <button onClick={() => handleEdit(row)} className="mr-2" style={{ color: 'var(--accent)' }} aria-label={`Edit ${row.item_name}`}><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(row.id)} style={{ color: 'var(--danger)' }} aria-label={`Delete ${row.item_name}`}><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
