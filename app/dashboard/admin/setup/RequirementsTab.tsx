// app/dashboard/admin/setup/RequirementsTab.tsx
// Manage Student Training Requirements per Program
// Controls: SPL, FRTOL(R), Air Regulations, ground exams, etc.

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';

interface TrainingProgram {
  id: number;
  program_name: string;
  program_code: string;
}

interface Requirement {
  id: number;
  student_id?: string;
  requirement_name: string;
  requirement_category: string;
  program_code: string;
  is_completed?: boolean;
  sort_order: number;
  validity_years: number | null;
  required_before_hours: number | null;
  blocks_solo: boolean;
  blocks_all_flights: boolean;
  notes: string;
}

export default function RequirementsTab() {
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProgram, setSelectedProgram] = useState('CPL');
  const [editing, setEditing] = useState<Requirement | null>(null);
  const [form, setForm] = useState({
    requirement_name: '',
    requirement_category: 'CPL',
    program_code: 'CPL',
    sort_order: 99,
    validity_years: null as number | null,
    required_before_hours: null as number | null,
    blocks_solo: false,
    blocks_all_flights: false,
    notes: '',
  });

  // Load data on mount
  useEffect(() => {
    loadPrograms();
    loadRequirements();
  }, []);

  // Reload when program changes
  useEffect(() => {
    loadRequirements();
    setForm(p => ({ ...p, program_code: selectedProgram, requirement_category: selectedProgram }));
  }, [selectedProgram]);

  const loadPrograms = async () => {
    const { data } = await supabase.from('training_programs').select('*').order('sort_order');
    setPrograms(data || []);
  };

  const loadRequirements = async () => {
    setLoading(true);
    console.log('Fetching requirements for', selectedProgram);
    
    // Get template requirements (where student_id is NULL) for this program
    const { data, error } = await supabase
      .from('training_requirements')
      .select('*')
      .is('student_id', null)
      .eq('program_code', selectedProgram)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error loading requirements:', error.message);
    } else {
      console.log('Loaded requirements:', data?.length, 'items');
      setRequirements(data || []);
    }
    setLoading(false);
  };

  // Add or update requirement
  const handleSave = async () => {
    if (!form.requirement_name) return;

    if (editing) {
      await supabase.from('training_requirements').update(form).eq('id', editing.id);
    } else {
      await supabase.from('training_requirements').insert({
        ...form,
        student_id: null, // Template requirement (not for a specific student)
      });
    }

    setEditing(null);
    setForm({
      requirement_name: '',
      requirement_category: selectedProgram,
      program_code: selectedProgram,
      sort_order: 99,
      validity_years: null,
      required_before_hours: null,
      blocks_solo: false,
      blocks_all_flights: false,
      notes: '',
    });
    loadRequirements();
  };

  // Edit existing
  const handleEdit = (req: Requirement) => {
    setEditing(req);
    setForm({
      requirement_name: req.requirement_name,
      requirement_category: req.requirement_category,
      program_code: req.program_code,
      sort_order: req.sort_order,
      validity_years: req.validity_years,
      required_before_hours: req.required_before_hours,
      blocks_solo: req.blocks_solo,
      blocks_all_flights: req.blocks_all_flights,
      notes: req.notes || '',
    });
  };

  // Delete
  const handleDelete = async (id: number) => {
    if (window.confirm('Delete this requirement template? This will not affect existing student requirements.')) {
      await supabase.from('training_requirements').delete().eq('id', id);
      loadRequirements();
    }
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">✅ Training Requirements</h2>
      <p className="text-sm text-slate-400 mb-4">
        Define the requirements students must complete for each training program. These are used to validate bookings and track progress.
      </p>

      {/* Program Selector */}
      <div className="mb-6">
        <label className="block text-sm text-slate-400 mb-2">Select Training Program:</label>
        <div className="flex flex-wrap gap-2">
          {programs.map(prog => (
            <button
              key={prog.id}
              onClick={() => setSelectedProgram(prog.program_code)}
              className={`px-4 py-2 rounded-lg text-sm transition ${
                selectedProgram === prog.program_code
                  ? 'bg-blue-500 text-white font-medium'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {prog.program_name} ({prog.program_code})
            </button>
          ))}
        </div>
      </div>

      {/* Add/Edit Form */}
      <div className="bg-slate-700/50 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-medium text-white mb-3">
          {editing ? '✏️ Edit Requirement' : `➕ Add Requirement for ${selectedProgram}`}
        </h3>

        {/* Requirement Name */}
        <div className="mb-3">
          <label className="block text-xs text-slate-400 mb-1">Requirement Name *</label>
          <input
            type="text"
            placeholder="e.g., Air Regulations (valid 5 yrs)"
            value={form.requirement_name}
            onChange={e => setForm(p => ({ ...p, requirement_name: e.target.value }))}
            className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          {/* Sort Order */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Sort Order</label>
            <input
              type="number"
              value={form.sort_order}
              onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))}
              className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>

          {/* Validity Years */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Validity (Years)</label>
            <input
              type="number"
              step="0.5"
              placeholder="e.g., 5"
              value={form.validity_years ?? ''}
              onChange={e => setForm(p => ({ ...p, validity_years: e.target.value ? parseFloat(e.target.value) : null }))}
              className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>

          {/* Required Before Hours */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Required Before (Hours)</label>
            <input
              type="number"
              placeholder="e.g., 150"
              value={form.required_before_hours ?? ''}
              onChange={e => setForm(p => ({ ...p, required_before_hours: e.target.value ? parseInt(e.target.value) : null }))}
              className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
        </div>

        {/* Blocking Flags */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={form.blocks_solo}
              onChange={e => setForm(p => ({ ...p, blocks_solo: e.target.checked }))}
              className="w-4 h-4"
            />
            <label className="text-sm text-slate-300">
              🔒 Blocks Solo Flying (if not completed)
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={form.blocks_all_flights}
              onChange={e => setForm(p => ({ ...p, blocks_all_flights: e.target.checked }))}
              className="w-4 h-4"
            />
            <label className="text-sm text-slate-300">
              🔒 Blocks All Flying (if not completed)
            </label>
          </div>
        </div>

        {/* Notes */}
        <div className="mb-3">
          <label className="block text-xs text-slate-400 mb-1">Notes</label>
          <input
            type="text"
            placeholder="Additional notes about this requirement"
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2">
          <button onClick={handleSave} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">
            {editing ? '💾 Update Requirement' : '➕ Add Requirement'}
          </button>
          {editing && (
            <button
              onClick={() => {
                setEditing(null);
                setForm({
                  requirement_name: '', requirement_category: selectedProgram,
                  program_code: selectedProgram, sort_order: 99,
                  validity_years: null, required_before_hours: null,
                  blocks_solo: false, blocks_all_flights: false, notes: '',
                });
              }}
              className="px-4 py-2 bg-slate-500 text-white rounded-lg text-sm hover:bg-slate-600"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Requirements List */}
      {loading ? (
        <p className="text-slate-400 text-center py-4">Loading...</p>
      ) : requirements.length === 0 ? (
        <p className="text-slate-400 text-center py-4">
          No requirements defined for {selectedProgram}. Add your first one above.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-700">
                <th className="pb-3">#</th>
                <th className="pb-3">Requirement</th>
                <th className="pb-3">Validity</th>
                <th className="pb-3">Before Hours</th>
                <th className="pb-3">Blocks Solo</th>
                <th className="pb-3">Blocks All</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {requirements.map((req, index) => (
                <tr key={req.id} className="border-b border-slate-700/50">
                  <td className="py-3 text-xs text-slate-500">{index + 1}</td>
                  <td className="py-3 text-white font-medium">{req.requirement_name}</td>
                  <td className="py-3 text-xs">
                    {req.validity_years ? `${req.validity_years} yrs` : '—'}
                  </td>
                  <td className="py-3 text-xs">
                    {req.required_before_hours ? `${req.required_before_hours}h` : '—'}
                  </td>
                  <td className="py-3">
                    {req.blocks_solo ? (
                      <span className="text-red-400">🔒 Yes</span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="py-3">
                    {req.blocks_all_flights ? (
                      <span className="text-red-400">🔒 Yes</span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="py-3">
                    <button onClick={() => handleEdit(req)} className="text-blue-400 hover:text-blue-300 mr-2">✏️</button>
                    <button onClick={() => handleDelete(req.id)} className="text-red-400 hover:text-red-300">🗑️</button>
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