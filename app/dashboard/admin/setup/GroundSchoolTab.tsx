// app/dashboard/admin/setup/GroundSchoolTab.tsx
// Super Admin: Manage ground school subjects
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';

interface Subject {
  id: number;
  subject_name: string;
  subject_code: string;
  validity_years: number | null;
  required_before_hours: number | null;
  is_mandatory: boolean;
  sort_order: number;
  is_active: boolean;
}

export default function GroundSchoolTab() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [form, setForm] = useState({
    subject_name: '',
    subject_code: '',
    validity_years: null as number | null,
    required_before_hours: null as number | null,
    is_mandatory: true,
    sort_order: 99,
    is_active: true,
  });

  useEffect(() => { loadSubjects(); }, []);

  const loadSubjects = async () => {
    setLoading(true);
    const { data } = await supabase.from('ground_school_subjects').select('*').order('sort_order');
    setSubjects(data || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.subject_name || !form.subject_code) return;
    if (editing) {
      await supabase.from('ground_school_subjects').update(form).eq('id', editing.id);
    } else {
      await supabase.from('ground_school_subjects').insert(form);
    }
    setEditing(null);
    setForm({ subject_name: '', subject_code: '', validity_years: null, required_before_hours: null, is_mandatory: true, sort_order: 99, is_active: true });
    loadSubjects();
  };

  const handleEdit = (s: Subject) => {
    setEditing(s);
    setForm({ subject_name: s.subject_name, subject_code: s.subject_code, validity_years: s.validity_years, required_before_hours: s.required_before_hours, is_mandatory: s.is_mandatory, sort_order: s.sort_order, is_active: s.is_active });
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Delete this subject?')) {
      await supabase.from('ground_school_subjects').delete().eq('id', id);
      loadSubjects();
    }
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">🏫 Ground School Subjects</h2>
      <p className="text-sm text-slate-400 mb-4">Configure the theoretical subjects for ground school training.</p>

      {/* Add/Edit Form */}
      <div className="bg-slate-700/50 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-medium text-white mb-3">{editing ? '✏️ Edit Subject' : '➕ Add Subject'}</h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <input type="text" placeholder="Subject Name" value={form.subject_name} onChange={e => setForm(p => ({ ...p, subject_name: e.target.value }))} className="bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm" />
          <input type="text" placeholder="Subject Code" value={form.subject_code} onChange={e => setForm(p => ({ ...p, subject_code: e.target.value.toUpperCase() }))} className="bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm" />
          <input type="number" step="0.5" placeholder="Validity (Years)" value={form.validity_years ?? ''} onChange={e => setForm(p => ({ ...p, validity_years: e.target.value ? parseFloat(e.target.value) : null }))} className="bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm" />
          <input type="number" placeholder="Required Before (Hours)" value={form.required_before_hours ?? ''} onChange={e => setForm(p => ({ ...p, required_before_hours: e.target.value ? parseInt(e.target.value) : null }))} className="bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm" />
        </div>
        <div className="flex space-x-2">
          <button onClick={handleSave} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">{editing ? '💾 Update' : '➕ Add'}</button>
          {editing && <button onClick={() => { setEditing(null); setForm({ subject_name: '', subject_code: '', validity_years: null, required_before_hours: null, is_mandatory: true, sort_order: 99, is_active: true }); }} className="px-4 py-2 bg-slate-500 text-white rounded-lg text-sm hover:bg-slate-600">Cancel</button>}
        </div>
      </div>

      {/* Subjects List */}
      {loading ? <p className="text-slate-400 text-center py-4">Loading...</p> : subjects.length === 0 ? <p className="text-slate-400 text-center py-4">No subjects defined.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-400 border-b border-slate-700"><th className="pb-3">Subject</th><th className="pb-3">Code</th><th className="pb-3">Validity</th><th className="pb-3">Before Hours</th><th className="pb-3">Actions</th></tr></thead>
            <tbody className="text-slate-300">
              {subjects.map(s => (
                <tr key={s.id} className="border-b border-slate-700/50">
                  <td className="py-3 text-white font-medium">{s.subject_name}</td>
                  <td className="py-3"><span className="bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded text-xs">{s.subject_code}</span></td>
                  <td className="py-3 text-xs">{s.validity_years ? `${s.validity_years} yrs` : '—'}</td>
                  <td className="py-3 text-xs">{s.required_before_hours ? `${s.required_before_hours}h` : '—'}</td>
                  <td className="py-3"><button onClick={() => handleEdit(s)} className="text-blue-400 hover:text-blue-300 mr-2">✏️</button><button onClick={() => handleDelete(s.id)} className="text-red-400 hover:text-red-300">🗑️</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}