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

import { useState, useEffect, useCallback, useRef } from 'react';
import { mutate } from 'swr';
import { supabase } from '@/lib/supabase-client';
import Papa from 'papaparse';
import { Wrench, Pencil, Plus, Save, Trash2, Upload, Download, LoaderCircle } from 'lucide-react';
import { maintenanceScheduleTemplatesKey } from '@/lib/hooks/useMaintenanceRecords';

interface ScheduleTemplateRow {
  id: number;
  aircraft_model: string;
  item_name: string;
  interval_type: 'HOBBS_HOURS' | 'CALENDAR_MONTHS';
  interval_value: number;
  notes: string | null;
  is_active: boolean;
  // 2026-08-27 — see add-schedule-template-engine-type.sql. Same value
  // expected across every row for a given aircraft_model; the Engine Type
  // selector below keeps them in sync when changed.
  engine_type: string | null;
}

const ENGINE_TYPES = ['Single Engine', 'Multi Engine'];

// 2026-08-27: a CSV row ready to insert, after validation — see
// handleCsvUpload below. Kept as its own typed shape (rather than a plain
// Record<string, unknown>) so the skip-reporting code after a failed bulk
// insert can read back .aircraft_model/.item_name without casting.
interface ScheduleImportRow {
  aircraft_model: string;
  item_name: string;
  interval_type: 'HOBBS_HOURS' | 'CALENDAR_MONTHS';
  interval_value: number;
  notes: string;
  is_active: boolean;
  engine_type: string | null;
}

// Result summary shown after a CSV bulk import — "Append + skip
// duplicates", same convention as ExercisesTab.tsx's own CSV import: new
// rows are added; a row whose Model + Item Name pair already exists (in the
// DB, or earlier in the same CSV batch) is skipped and reported, mirroring
// this table's own unique(aircraft_model, item_name) constraint. Existing
// rows are never overwritten via this path — use the per-item Edit action
// for that.
interface CsvImportResult {
  added: number;
  skipped: { row: number; label: string; reason: string }[];
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

  // ----- CSV bulk import state (2026-08-27) -----
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<CsvImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      // 2026-09-01 (SWR migration, Stage 6): this tab keeps its own local
      // load/state, independent of useMaintenanceScheduleTemplates() — so
      // every write here (Add/Edit/Delete/Engine Type/CSV import, all of
      // which already call loadTemplates() on success) also has to nudge
      // that SWR cache, or the Maintenance Due panel elsewhere in the app
      // keeps showing templates as they were before this edit until the
      // cache happens to revalidate on its own.
      mutate(maintenanceScheduleTemplatesKey);
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

  // 2026-08-27: Engine Type for the currently-selected model — derived
  // from its existing rows (they should all agree, since this UI is what
  // keeps them in sync) rather than tracked as separate independent state,
  // so switching models always reflects the real DB state, not a stale
  // selection left over from whichever model was picked before.
  const modelEngineType = rowsForModel.find(r => r.engine_type)?.engine_type || '';

  const resetForm = () => {
    setEditing(null);
    setForm({ item_name: '', interval_type: 'HOBBS_HOURS', interval_value: 100, notes: '', is_active: true });
  };

  // Applies an Engine Type to EVERY existing row for the selected model in
  // one go (not just new items going forward) — the column is denormalized
  // across all ~8 item-rows per model, so this is what keeps them from
  // silently drifting apart. A brand-new model with zero rows yet has
  // nothing to sync; its first "Add Item" save (below) carries the value.
  const handleSetEngineType = async (newType: string) => {
    await Promise.all(
      rowsForModel.map(row =>
        fetch('/api/admin/config/aircraft-maintenance-schedule', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: row.id, engine_type: newType || null }),
        })
      )
    );
    loadTemplates();
  };

  const handleSave = async () => {
    if (!form.item_name || !selectedModel) return;

    const body = { aircraft_model: selectedModel, engine_type: modelEngineType || null, ...form };

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

  // Downloadable CSV template — columns match what handleCsvUpload expects,
  // same pattern as ExercisesTab.tsx's own template. Two example rows for
  // the same model, to show both interval_type values at a glance.
  const downloadTemplate = () => {
    const csv =
      'aircraft_model,item_name,interval_type,interval_value,notes,is_active,engine_type\n' +
      "Cessna 172,100-Hour Inspection,HOBBS_HOURS,100,FAA Part 91.409-style convention — confirm against your approved CAMP,true,Single Engine\n" +
      'Cessna 172,Annual Inspection,CALENDAR_MONTHS,12,Standard annual inspection cadence,true,Single Engine\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aircraft_maintenance_schedule_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Bulk import schedule items from a CSV file — "Append + skip
  // duplicates", same convention as ExercisesTab.tsx: new rows are
  // inserted; any row whose (aircraft_model, item_name) pair already
  // exists (in the DB, or earlier in this same CSV batch) is skipped and
  // reported. Existing rows are never overwritten. Deliberately NOT scoped
  // to selectedModel — a CSV can cover several models in one upload, which
  // is the actual point of this feature (bulk-seeding a new aircraft
  // type's whole schedule, or adding many items at once, instead of the
  // one-item-at-a-time Add form above).
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvUploading(true);
    setCsvResult(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as Record<string, string>[];
        const existingKeys = new Set(
          templates.map(t => `${t.aircraft_model.trim().toLowerCase()}|${t.item_name.trim().toLowerCase()}`)
        );
        const seenInBatch = new Set<string>();
        const toInsert: ScheduleImportRow[] = [];
        const skipped: CsvImportResult['skipped'] = [];

        rows.forEach((row, idx) => {
          const rowNum = idx + 2; // +1 for 0-index, +1 for header row
          const aircraft_model = (row.aircraft_model || '').trim();
          const item_name = (row.item_name || '').trim();
          const label = aircraft_model && item_name ? `${aircraft_model} — ${item_name}` : '(incomplete row)';

          if (!aircraft_model || !item_name) {
            skipped.push({ row: rowNum, label, reason: 'Missing required aircraft_model or item_name' });
            return;
          }

          const intervalType = (row.interval_type || '').trim().toUpperCase();
          if (intervalType !== 'HOBBS_HOURS' && intervalType !== 'CALENDAR_MONTHS') {
            skipped.push({ row: rowNum, label, reason: 'interval_type must be HOBBS_HOURS or CALENDAR_MONTHS' });
            return;
          }

          const intervalValue = parseFloat(row.interval_value);
          if (!Number.isFinite(intervalValue) || intervalValue <= 0) {
            skipped.push({ row: rowNum, label, reason: 'interval_value must be a positive number' });
            return;
          }

          const key = `${aircraft_model.toLowerCase()}|${item_name.toLowerCase()}`;
          if (existingKeys.has(key) || seenInBatch.has(key)) {
            skipped.push({ row: rowNum, label, reason: 'Duplicate — a schedule item with this Model + Item Name already exists' });
            return;
          }

          // engine_type is optional (blank = shown for either Type, same
          // fallback the manual Add form and the Aircraft dropdown filter
          // both already use) but must be one of the two real values if
          // given — the DB column has a CHECK constraint, and this whole
          // batch is inserted in one call (see the bulk POST branch in
          // app/api/admin/config/[table]/route.ts), so one bad value here
          // would otherwise fail every row in the upload, not just this one.
          const engineTypeRaw = (row.engine_type || '').trim();
          let engine_type: string | null = null;
          if (engineTypeRaw) {
            if (!ENGINE_TYPES.includes(engineTypeRaw)) {
              skipped.push({
                row: rowNum,
                label,
                reason: `engine_type must be blank, "Single Engine", or "Multi Engine" (got "${engineTypeRaw}")`,
              });
              return;
            }
            engine_type = engineTypeRaw;
          }

          seenInBatch.add(key);
          toInsert.push({
            aircraft_model,
            item_name,
            interval_type: intervalType,
            interval_value: intervalValue,
            notes: (row.notes || '').trim(),
            is_active: row.is_active === undefined || row.is_active === '' ? true : /^(true|1|yes)$/i.test(row.is_active.trim()),
            engine_type,
          });
        });

        let added = 0;
        if (toInsert.length > 0) {
          const res = await fetch('/api/admin/config/aircraft-maintenance-schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toInsert),
          });
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            console.error('Error bulk-importing maintenance schedule items:', errBody);
            skipped.push(...toInsert.map((row, i) => ({
              row: i,
              label: `${row.aircraft_model} — ${row.item_name}`,
              reason: 'Insert failed: ' + (errBody.error || 'unknown error'),
            })));
          } else {
            added = toInsert.length;
          }
        }

        setCsvResult({ added, skipped });
        setCsvUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (added > 0) loadTemplates();
      },
      error: (err) => {
        console.error('Error parsing CSV:', err);
        setCsvResult({ added: 0, skipped: [{ row: 0, label: '', reason: 'Failed to parse CSV file: ' + err.message }] });
        setCsvUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
    });
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

      {/* Bulk Import (CSV) — 2026-08-27, same download-template/upload-back
          pattern as ExercisesTab.tsx, adapted for this table's own
          required columns and its (aircraft_model, item_name) uniqueness
          rule. Deliberately NOT scoped to the model selected below — a CSV
          can cover several models in one upload (e.g. seeding a whole new
          aircraft type's schedule), which is the actual point: saving the
          repeated one-item-at-a-time Add flow for a real bulk job. */}
      <div className="surface-inner p-4 mb-6">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
          <Upload className="w-3.5 h-3.5" /> Bulk Import (CSV)
        </h3>
        <p className="text-xs text-tertiary mb-3">
          Upload a CSV with columns{' '}
          <code>aircraft_model, item_name, interval_type, interval_value, notes, is_active, engine_type</code>.
          Rows can cover any model, not just {selectedModel} below — handy for seeding a whole new aircraft
          type&apos;s schedule in one go. <code>interval_type</code> must be <code>HOBBS_HOURS</code> or{' '}
          <code>CALENDAR_MONTHS</code>; <code>engine_type</code> may be left blank, or set to{' '}
          <code>Single Engine</code> / <code>Multi Engine</code>. New rows are added; a row whose Model + Item
          Name already exists is skipped and reported below.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <label
            className="px-4 py-2 rounded-lg text-sm transition flex items-center gap-1.5 font-semibold cursor-pointer surface-muted"
            style={{ color: 'var(--text-primary)' }}
          >
            {csvUploading ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {csvUploading ? 'Importing...' : 'Upload CSV'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleCsvUpload}
              disabled={csvUploading}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={downloadTemplate}
            className="px-4 py-2 rounded-lg text-sm transition flex items-center gap-1.5 surface-inner"
          >
            <Download className="w-3.5 h-3.5" /> Download Template
          </button>
        </div>

        {csvResult && (
          <div className="mt-3 text-sm">
            <p style={{ color: 'var(--accent)' }}>
              ✅ Added {csvResult.added} item{csvResult.added === 1 ? '' : 's'}.
              {csvResult.skipped.length > 0 && ` Skipped ${csvResult.skipped.length}.`}
            </p>
            {csvResult.skipped.length > 0 && (
              <ul className="mt-2 text-xs text-tertiary space-y-0.5 max-h-40 overflow-y-auto">
                {csvResult.skipped.map((s, i) => (
                  <li key={i}>Row {s.row} ({s.label}): {s.reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

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

      {/* Engine Type for the selected model — 2026-08-27. Drives the
          Single Engine / Multi Engine filter on the Aircraft form's Model
          dropdown (AircraftFormModal.tsx/AircraftSetupTab.tsx). Changing
          this updates every existing schedule item for this model at once. */}
      <div className="mb-6">
        <label className="block text-sm text-secondary mb-2">
          Engine Type for {selectedModel}:
        </label>
        <select
          value={modelEngineType}
          onChange={e => handleSetEngineType(e.target.value)}
          className={`${inputClass} max-w-xs`}
        >
          <option value="">Not set — shown for either Type</option>
          {ENGINE_TYPES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <p className="text-xs text-tertiary mt-1">
          Used to filter the Aircraft Model dropdown by Type. Leaving this unset means {selectedModel} shows up
          regardless of whether Single Engine or Multi Engine is selected there.
        </p>
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
