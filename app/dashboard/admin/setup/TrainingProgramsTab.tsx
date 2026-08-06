// app/dashboard/admin/setup/TrainingProgramsTab.tsx
// Manage Training Programs (PPL, CPL, IR, etc.)

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';

interface TrainingProgram {
  id: number;
  program_name: string;
  program_code: string;
  required_hours: number;
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
    setForm({ program_name: '', program_code: '', required_hours: 40, description: '', is_active: true, sort_order: 99 });
    loadPrograms();
  };

  // Edit program
  const handleEdit = (program: TrainingProgram) => {
    setEditing(program);
    setForm({
      program_name: program.program_name,
      program_code: program.program_code,
      required_hours: program.required_hours,
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

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">📚 Training Programs</h2>

      {/* Add/Edit Form */}
      <div className="bg-slate-700/50 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-medium text-white mb-3">
          {editing ? '✏️ Edit Program' : '➕ Add New Program'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <input
            type="text"
            placeholder="Program Name (e.g., Private Pilot License)"
            value={form.program_name}
            onChange={e => setForm(p => ({ ...p, program_name: e.target.value }))}
            className="bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
          />
          <input
            type="text"
            placeholder="Code (e.g., PPL)"
            value={form.program_code}
            onChange={e => setForm(p => ({ ...p, program_code: e.target.value }))}
            className="bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
          />
          <input
            type="number"
            placeholder="Required Hours"
            value={form.required_hours}
            onChange={e => setForm(p => ({ ...p, required_hours: parseInt(e.target.value) || 0 }))}
            className="bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
          />
        </div>
        <div className="flex space-x-2">
          <button onClick={handleSave} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">
            {editing ? '💾 Update' : '➕ Add'}
          </button>
          {editing && (
            <button onClick={() => { setEditing(null); setForm({ program_name: '', program_code: '', required_hours: 40, description: '', is_active: true, sort_order: 99 }); }}
              className="px-4 py-2 bg-slate-500 text-white rounded-lg text-sm hover:bg-slate-600">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Programs List */}
      {loading ? (
        <p className="text-slate-400 text-center py-4">Loading...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-700">
                <th className="pb-3">Program</th>
                <th className="pb-3">Code</th>
                <th className="pb-3">Hours</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {programs.map(prog => (
                <tr key={prog.id} className="border-b border-slate-700/50">
                  <td className="py-3 text-white font-medium">{prog.program_name}</td>
                  <td className="py-3">
                    <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded text-xs">{prog.program_code}</span>
                  </td>
                  <td className="py-3">{prog.required_hours}h</td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${prog.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {prog.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3">
                    <button onClick={() => handleEdit(prog)} className="text-blue-400 hover:text-blue-300 mr-2">✏️</button>
                    <button onClick={() => handleDelete(prog.id)} className="text-red-400 hover:text-red-300">🗑️</button>
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