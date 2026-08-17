// app/dashboard/admin/setup/TrainingProgramsTab.tsx
// Manage Training Programs (PPL, CPL, IR, etc.)

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';
import { BookOpen, Pencil, Plus, Save, Trash2 } from 'lucide-react';

interface TrainingProgram {
  id: number;
  program_name: string;
  program_code: string;
  required_hours: number;
  // Per-metric hour/count minimums, used by the Progress page instead of
  // its old hardcoded PPL/CPL constants — see add-training-program-requirement-columns.sql.
  // Nullable: an unset value falls back to a built-in default on the
  // Progress page rather than showing 0/blocking that metric's progress bar.
  solo_hours: number | null;
  cross_country_hours: number | null;
  instrument_hours: number | null;
  night_hours: number | null;
  landings_required: number | null;
  description: string;
  is_active: boolean;
  sort_order: number;
}

export default function TrainingProgramsTab() {
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TrainingProgram | null>(null);
  const [form, setForm] = useState({
    program_name: '',
    program_code: '',
    required_hours: 40,
    solo_hours: null as number | null,
    cross_country_hours: null as number | null,
    instrument_hours: null as number | null,
    night_hours: null as number | null,
    landings_required: null as number | null,
    description: '',
    is_active: true,
    sort_order: 99,
  });

  // Load programs
  useEffect(() => {
    loadPrograms();
  }, []);

  const loadPrograms = async () => {
  setLoading(true);
  console.log('Fetching training programs...');

    const { data, error } = await supabase
      .from('training_programs')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error loading programs:', error.message);
    } else {
      console.log('Loaded programs:', data);
      setPrograms(data || []);
  }

  setLoading(false);
};

  // Add / Update program
  const handleSave = async () => {
    if (!form.program_name || !form.program_code) return;

    if (editing) {
      await supabase.from('training_programs').update(form).eq('id', editing.id);
    } else {
      await supabase.from('training_programs').insert(form);
    }

    setEditing(null);
    setForm({
      program_name: '', program_code: '', required_hours: 40,
      solo_hours: null, cross_country_hours: null, instrument_hours: null, night_hours: null, landings_required: null,
      description: '', is_active: true, sort_order: 99,
    });
    loadPrograms();
  };

  // Edit program
  const handleEdit = (program: TrainingProgram) => {
    setEditing(program);
    setForm({
      program_name: program.program_name,
      program_code: program.program_code,
      required_hours: program.required_hours,
      solo_hours: program.solo_hours,
      cross_country_hours: program.cross_country_hours,
      instrument_hours: program.instrument_hours,
      night_hours: program.night_hours,
      landings_required: program.landings_required,
      description: program.description,
      is_active: program.is_active,
      sort_order: program.sort_order,
    });
  };

  // Delete program
  const handleDelete = async (id: number) => {
    if (window.confirm('Delete this program?')) {
      await supabase.from('training_programs').delete().eq('id', id);
      loadPrograms();
    }
  };

  const inputClass = "surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]";

  return (
    <div className="surface-card p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-secondary" /> Training Programs
      </h2>

      {/* Add/Edit Form */}
      <div className="surface-inner p-4 mb-6">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
          {editing ? <><Pencil className="w-3.5 h-3.5" /> Edit Program</> : <><Plus className="w-3.5 h-3.5" /> Add New Program</>}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <input
            type="text"
            placeholder="Program Name (e.g., Private Pilot License)"
            value={form.program_name}
            onChange={e => setForm(p => ({ ...p, program_name: e.target.value }))}
            className={inputClass}
          />
          <input
            type="text"
            placeholder="Code (e.g., PPL)"
            value={form.program_code}
            onChange={e => setForm(p => ({ ...p, program_code: e.target.value }))}
            className={inputClass}
          />
          <input
            type="number"
            placeholder="Required Hours"
            value={form.required_hours}
            onChange={e => setForm(p => ({ ...p, required_hours: parseInt(e.target.value) || 0 }))}
            className={inputClass}
          />
        </div>

        {/* Per-metric requirement minimums — feed the Progress page's
            per-student progress bars (Solo/Cross-Country/Instrument/Night
            hours, Landings), replacing what used to be hardcoded PPL/CPL
            constants in that page. Leave a field blank to fall back to a
            built-in default there instead of showing 0%/100% incorrectly. */}
        <div className="mb-3">
          <p className="text-xs text-tertiary mb-2">
            Progress tracking minimums (used on the Progress page — leave blank to use a built-in default)
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs text-tertiary mb-1">Solo Hours</label>
              <input type="number" placeholder="e.g., 10" value={form.solo_hours ?? ''}
                onChange={e => setForm(p => ({ ...p, solo_hours: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-tertiary mb-1">Cross-Country Hours</label>
              <input type="number" placeholder="e.g., 5" value={form.cross_country_hours ?? ''}
                onChange={e => setForm(p => ({ ...p, cross_country_hours: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-tertiary mb-1">Instrument Hours</label>
              <input type="number" placeholder="e.g., 3" value={form.instrument_hours ?? ''}
                onChange={e => setForm(p => ({ ...p, instrument_hours: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-tertiary mb-1">Night Hours</label>
              <input type="number" placeholder="e.g., 3" value={form.night_hours ?? ''}
                onChange={e => setForm(p => ({ ...p, night_hours: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-tertiary mb-1">Landings</label>
              <input type="number" placeholder="e.g., 20" value={form.landings_required ?? ''}
                onChange={e => setForm(p => ({ ...p, landings_required: e.target.value === '' ? null : parseInt(e.target.value) }))}
                className={inputClass} />
            </div>
          </div>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm transition flex items-center gap-1.5 font-semibold"
            style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
          >
            {editing ? <><Save className="w-3.5 h-3.5" /> Update</> : <><Plus className="w-3.5 h-3.5" /> Add</>}
          </button>
          {editing && (
            <button onClick={() => { setEditing(null); setForm({
                program_name: '', program_code: '', required_hours: 40,
                solo_hours: null, cross_country_hours: null, instrument_hours: null, night_hours: null, landings_required: null,
                description: '', is_active: true, sort_order: 99,
              }); }}
              className="px-4 py-2 rounded-lg text-sm transition surface-inner">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Programs List */}
      {loading ? (
        <p className="text-secondary text-center py-4">Loading...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                <th className="pb-3">Program</th>
                <th className="pb-3">Code</th>
                <th className="pb-3">Hours</th>
                <th className="pb-3">Progress Targets</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="text-secondary">
              {programs.map(prog => (
                <tr key={prog.id} className="border-b" style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
                  <td className="py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{prog.program_name}</td>
                  <td className="py-3">
                    <span className="badge badge-accent">{prog.program_code}</span>
                  </td>
                  <td className="py-3">{prog.required_hours}h</td>
                  <td className="py-3 text-xs text-tertiary">
                    {[
                      prog.solo_hours != null ? `Solo ${prog.solo_hours}h` : null,
                      prog.cross_country_hours != null ? `X-Ctry ${prog.cross_country_hours}h` : null,
                      prog.instrument_hours != null ? `Instr ${prog.instrument_hours}h` : null,
                      prog.night_hours != null ? `Night ${prog.night_hours}h` : null,
                      prog.landings_required != null ? `${prog.landings_required} landings` : null,
                    ].filter(Boolean).join(' · ') || '— (using defaults)'}
                  </td>
                  <td className="py-3">
                    <span className={`badge ${prog.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {prog.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3">
                    <button onClick={() => handleEdit(prog)} className="mr-2" style={{ color: 'var(--accent)' }}><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(prog.id)} style={{ color: 'var(--danger)' }}><Trash2 className="w-3.5 h-3.5" /></button>
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
