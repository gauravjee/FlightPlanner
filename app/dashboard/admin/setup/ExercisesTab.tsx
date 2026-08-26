// app/dashboard/admin/setup/ExercisesTab.tsx
// Manage Exercise Codes (CCTS, ST&RE, X-CTY, etc.)
// These appear on the Gantt chart flight blocks

'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase-client';
import Papa from 'papaparse';
import { ClipboardList, Pencil, Plus, Save, Trash2, RefreshCw, Search, Upload, Download, LoaderCircle } from 'lucide-react';

interface Exercise {
  id: number;
  exercise_name: string;
  short_code: string;
  full_description: string;
  is_active: boolean;
  sort_order: number;
}

// Result summary shown after a CSV bulk import — "Append + skip duplicates":
// rows whose short_code already exists (in the DB, or earlier in the same
// CSV batch) are skipped; existing exercises are never overwritten.
interface CsvImportResult {
  added: number;
  skipped: { row: number; short_code: string; reason: string }[];
}

export default function ExercisesTab() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState({
    exercise_name: '',
    short_code: '',
    full_description: '',
    is_active: true,
    sort_order: 99,
  });

  // ----- CSV bulk import state -----
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<CsvImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadExercises = async () => {
    setLoading(true);
    console.log('Fetching exercises...');
    const { data, error } = await supabase
      .from('exercises')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error loading exercises:', error.message);
    } else {
      console.log('Loaded exercises:', data?.length, 'items');
      setExercises(data || []);
    }
    setLoading(false);
  };

  // Load exercises on mount
  useEffect(() => {
    loadExercises();
  }, []);

  // Add or update exercise
  //
  // 2026-08-21 (security hardening round): this used to write straight to
  // Supabase from the browser with the anon key — see the comment atop
  // app/api/admin/config/[table]/route.ts for why that's a real gap, and
  // why every Admin Setup config tab now goes through that one shared,
  // role-checked route instead.
  const handleSave = async () => {
    if (!form.exercise_name || !form.short_code) return;

    if (editing) {
      await fetch('/api/admin/config/exercises', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, ...form }),
      });
    } else {
      // Check for duplicate short code
      // `editing` is always null in this branch (we're in the `else` of
      // `if (editing)` above), so this condition always evaluates to
      // `true` — kept explicit (rather than dropped) so the duplicate
      // check here reads the same shape as the analogous check would on
      // an edit path, should this function ever be restructured.
      const exists = exercises.find(e =>
        e.short_code === form.short_code && true
      );
      if (exists) {
        alert('An exercise with this short code already exists!');
        return;
      }
      await fetch('/api/admin/config/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
    }

    setEditing(null);
    setForm({ exercise_name: '', short_code: '', full_description: '', is_active: true, sort_order: 99 });
    loadExercises();
  };

  // Edit existing
  const handleEdit = (exercise: Exercise) => {
    setEditing(exercise);
    setForm({
      exercise_name: exercise.exercise_name,
      short_code: exercise.short_code,
      full_description: exercise.full_description,
      is_active: exercise.is_active,
      sort_order: exercise.sort_order,
    });
  };

  // Delete
  const handleDelete = async (id: number) => {
    if (window.confirm('Delete this exercise? This will not affect existing bookings.')) {
      await fetch(`/api/admin/config/exercises?id=${id}`, { method: 'DELETE' });
      loadExercises();
    }
  };

  // Auto-generate short code from name
  const generateShortCode = (name: string): string => {
    if (!name) return '';
    // Take first letter of each word, uppercase
    return name
      .split(/[\s-]+/)
      .map(word => word.charAt(0).toUpperCase())
      .join('')
      .substring(0, 6);
  };

  // Downloadable CSV template — columns match what handleCsvUpload expects.
  const downloadTemplate = () => {
    const csv = 'exercise_name,short_code,full_description,sort_order,is_active\nCircuits & Landings,CCTS,CCTS - Circuits & Landings,10,true\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'exercises_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Bulk import exercises from a CSV file — "Append + skip duplicates":
  // new rows are inserted; any row whose short_code already exists (in the
  // DB, or earlier in this same CSV batch) is skipped and reported.
  // Existing exercises are never overwritten.
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
        const existingCodes = new Set(exercises.map(ex => ex.short_code.toUpperCase()));
        const seenInBatch = new Set<string>();
        const toInsert: (typeof form)[] = [];
        const skipped: CsvImportResult['skipped'] = [];

        rows.forEach((row, idx) => {
          const rowNum = idx + 2; // +1 for 0-index, +1 for header row
          const exercise_name = (row.exercise_name || '').trim();
          const short_code = (row.short_code || '').trim().toUpperCase();
          if (!exercise_name || !short_code) {
            skipped.push({ row: rowNum, short_code: short_code || '(blank)', reason: 'Missing required exercise_name or short_code' });
            return;
          }
          if (existingCodes.has(short_code) || seenInBatch.has(short_code)) {
            skipped.push({ row: rowNum, short_code, reason: 'Duplicate short_code — already exists' });
            return;
          }
          seenInBatch.add(short_code);
          const sortOrder = parseInt(row.sort_order, 10);
          toInsert.push({
            exercise_name,
            short_code,
            full_description: (row.full_description || '').trim(),
            is_active: row.is_active === undefined || row.is_active === '' ? true : /^(true|1|yes)$/i.test(row.is_active.trim()),
            sort_order: Number.isFinite(sortOrder) ? sortOrder : 99,
          });
        });

        let added = 0;
        if (toInsert.length > 0) {
          const res = await fetch('/api/admin/config/exercises', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toInsert),
          });
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            console.error('Error bulk-importing exercises:', errBody);
            skipped.push(...toInsert.map((row, i) => ({ row: i, short_code: row.short_code, reason: 'Insert failed: ' + (errBody.error || 'unknown error') })));
          } else {
            added = toInsert.length;
          }
        }

        setCsvResult({ added, skipped });
        setCsvUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (added > 0) loadExercises();
      },
      error: (err) => {
        console.error('Error parsing CSV:', err);
        setCsvResult({ added: 0, skipped: [{ row: 0, short_code: '', reason: 'Failed to parse CSV file: ' + err.message }] });
        setCsvUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
    });
  };

  // Filtered exercises
  const filteredExercises = exercises.filter(ex =>
    ex.exercise_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ex.short_code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const inputClass = "w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]";

  return (
    <div className="surface-card p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <ClipboardList className="w-4 h-4 text-secondary" /> Exercise Codes
      </h2>
      <p className="text-sm text-secondary mb-4">
        Manage the exercise codes that appear on flight blocks in the Gantt chart. These are the short codes like CCTS, ST&RE, X-CTY.
      </p>

      {/* Add/Edit Form */}
      <div className="surface-inner p-4 mb-6">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
          {editing ? <><Pencil className="w-3.5 h-3.5" /> Edit Exercise</> : <><Plus className="w-3.5 h-3.5" /> Add New Exercise</>}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          {/* Exercise Name */}
          <div>
            <label className="block text-xs text-tertiary mb-1">Exercise Name *</label>
            <input
              type="text"
              placeholder="e.g., Circuits & Landings"
              value={form.exercise_name}
              onChange={e => setForm(p => ({ ...p, exercise_name: e.target.value }))}
              className={inputClass}
            />
          </div>

          {/* Short Code */}
          <div>
            <label className="block text-xs text-tertiary mb-1">Short Code *</label>
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="e.g., CCTS"
                value={form.short_code}
                onChange={e => setForm(p => ({ ...p, short_code: e.target.value.toUpperCase() }))}
                maxLength={6}
                className={`flex-1 ${inputClass}`}
              />
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, short_code: generateShortCode(p.exercise_name) }))}
                className="px-2 py-1 rounded text-xs transition surface-inner text-secondary"
                title="Auto-generate from name"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Sort Order */}
          <div>
            <label className="block text-xs text-tertiary mb-1">Sort Order</label>
            <input
              type="number"
              value={form.sort_order}
              onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))}
              className={inputClass}
            />
          </div>
        </div>

        {/* Full Description */}
        <div className="mb-3">
          <label className="block text-xs text-tertiary mb-1">Full Description (for dropdown)</label>
          <input
            type="text"
            placeholder="e.g., CCTS - Circuits & Landings"
            value={form.full_description}
            onChange={e => setForm(p => ({ ...p, full_description: e.target.value }))}
            className={inputClass}
          />
        </div>

        {/* Active Toggle */}
        <div className="flex items-center space-x-2 mb-3">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}
            className="w-4 h-4"
          />
          <label className="text-sm text-secondary">Active (visible in booking form)</label>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2">
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm transition flex items-center gap-1.5 font-semibold"
            style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
          >
            {editing ? <><Save className="w-3.5 h-3.5" /> Update Exercise</> : <><Plus className="w-3.5 h-3.5" /> Add Exercise</>}
          </button>
          {editing && (
            <button
              onClick={() => {
                setEditing(null);
                setForm({ exercise_name: '', short_code: '', full_description: '', is_active: true, sort_order: 99 });
              }}
              className="px-4 py-2 rounded-lg text-sm transition surface-inner"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Bulk Import (CSV) */}
      <div className="surface-inner p-4 mb-6">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
          <Upload className="w-3.5 h-3.5" /> Bulk Import (CSV)
        </h3>
        <p className="text-xs text-tertiary mb-3">
          Upload a CSV with columns <code>exercise_name, short_code, full_description, sort_order, is_active</code>.
          New rows are added; rows with a short_code that already exists are skipped and reported below.
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
              ✅ Added {csvResult.added} exercise{csvResult.added === 1 ? '' : 's'}.
              {csvResult.skipped.length > 0 && ` Skipped ${csvResult.skipped.length}.`}
            </p>
            {csvResult.skipped.length > 0 && (
              <ul className="mt-2 text-xs text-tertiary space-y-0.5 max-h-40 overflow-y-auto">
                {csvResult.skipped.map((s, i) => (
                  <li key={i}>Row {s.row} ({s.short_code}): {s.reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="mb-4 relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
        <input
          type="text"
          placeholder="Search exercises by name or code..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full surface-inner rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
        />
      </div>

      {/* Exercises List */}
      {loading ? (
        <p className="text-secondary text-center py-4">Loading...</p>
      ) : filteredExercises.length === 0 ? (
        <p className="text-secondary text-center py-4">
          {searchTerm ? 'No exercises match your search.' : 'No exercises defined yet. Add your first one above.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                <th className="pb-3">Code</th>
                <th className="pb-3">Name</th>
                <th className="pb-3">Description</th>
                <th className="pb-3">Order</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="text-secondary">
              {filteredExercises.map(exercise => (
                <tr key={exercise.id} className="border-b" style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
                  <td className="py-3">
                    <span className="font-medium surface-muted px-2 py-0.5 rounded text-xs" style={{ color: 'var(--text-primary)' }}>
                      {exercise.short_code}
                    </span>
                  </td>
                  <td className="py-3" style={{ color: 'var(--text-primary)' }}>{exercise.exercise_name}</td>
                  <td className="py-3 text-xs text-tertiary max-w-[300px] truncate">
                    {exercise.full_description || '—'}
                  </td>
                  <td className="py-3 text-xs">{exercise.sort_order}</td>
                  <td className="py-3">
                    <span className={`badge ${exercise.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {exercise.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3">
                    <button onClick={() => handleEdit(exercise)} className="mr-2" style={{ color: 'var(--accent)' }} aria-label={`Edit ${exercise.exercise_name}`}><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(exercise.id)} style={{ color: 'var(--danger)' }} aria-label={`Delete ${exercise.exercise_name}`}><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      <div className="mt-4 text-xs text-tertiary">
        Showing {filteredExercises.length} of {exercises.length} exercises
      </div>
    </div>
  );
}
