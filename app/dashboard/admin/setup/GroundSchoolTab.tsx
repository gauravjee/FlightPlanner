// app/dashboard/admin/setup/GroundSchoolTab.tsx
// Super Admin: Manage ground school subjects
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { School, Pencil, Plus, Save, Trash2 } from 'lucide-react';

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
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [form, setForm] = useState({
    subject_name: '',
    subject_code: '',
    validity_years: null as number | null,
    required_before_hours: null as number | null,
    is_mandatory: true,
    sort_order: 99,
    is_active: true,
  });

  // Pure fetch — no setState here, so it's safe to call from an effect too
  // (react-hooks/set-state-in-effect flags any named function that sets
  // state anywhere in its body, even safely after an await, when called
  // from an effect).
  const fetchSubjects = async (): Promise<Subject[]> => {
    const { data } = await supabase.from('ground_school_subjects').select('*').order('sort_order');
    return data || [];
  };

  // Used by Save/Delete/Cancel below — event-handler calls, where setState
  // is always fine.
  const loadSubjects = async () => {
    setLoading(true);
    setSubjects(await fetchSubjects());
    setLoading(false);
  };

  useEffect(() => {
    fetchSubjects().then(data => { setSubjects(data); setLoading(false); });
  }, []);

  // 2026-08-21 (security hardening round): routed through the shared,
  // role-checked config route instead of writing to Supabase directly from
  // the browser — see app/api/admin/config/[table]/route.ts.
  const handleSave = async () => {
    if (!form.subject_name || !form.subject_code) return;
    if (editing) {
      await fetch('/api/admin/config/ground-school-subjects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, ...form }),
      });
    } else {
      await fetch('/api/admin/config/ground-school-subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
    }
    setEditing(null);
    setForm({ subject_name: '', subject_code: '', validity_years: null, required_before_hours: null, is_mandatory: true, sort_order: 99, is_active: true });
    loadSubjects();
  };

  const handleEdit = (s: Subject) => {
    setEditing(s);
    setForm({ subject_name: s.subject_name, subject_code: s.subject_code, validity_years: s.validity_years, required_before_hours: s.required_before_hours, is_mandatory: s.is_mandatory, sort_order: s.sort_order, is_active: s.is_active });
  };

  const handleDelete = (id: number) => {
    setDeleteTarget(id);
  };

  const handleDeleteConfirm = async () => {
    if (deleteTarget == null) return;
    await fetch(`/api/admin/config/ground-school-subjects?id=${deleteTarget}`, { method: 'DELETE' });
    setDeleteTarget(null);
    loadSubjects();
  };

  const inputClass = "surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]";

  return (
    <div className="surface-card p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <School className="w-4 h-4 text-secondary" /> Ground School Subjects
      </h2>
      <p className="text-sm text-secondary mb-4">Configure the theoretical subjects for ground school training.</p>

      {/* Add/Edit Form */}
      <div className="surface-inner p-4 mb-6">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
          {editing ? <><Pencil className="w-3.5 h-3.5" /> Edit Subject</> : <><Plus className="w-3.5 h-3.5" /> Add Subject</>}
        </h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <input type="text" placeholder="Subject Name" value={form.subject_name} onChange={e => setForm(p => ({ ...p, subject_name: e.target.value }))} className={inputClass} />
          <input type="text" placeholder="Subject Code" value={form.subject_code} onChange={e => setForm(p => ({ ...p, subject_code: e.target.value.toUpperCase() }))} className={inputClass} />
          <input type="number" step="0.5" placeholder="Validity (Years)" value={form.validity_years ?? ''} onChange={e => setForm(p => ({ ...p, validity_years: e.target.value ? parseFloat(e.target.value) : null }))} className={inputClass} />
          <input type="number" placeholder="Required Before (Hours)" value={form.required_before_hours ?? ''} onChange={e => setForm(p => ({ ...p, required_before_hours: e.target.value ? parseInt(e.target.value) : null }))} className={inputClass} />
        </div>
        <div className="flex space-x-2">
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm transition flex items-center gap-1.5 font-semibold"
            style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
          >
            {editing ? <><Save className="w-3.5 h-3.5" /> Update</> : <><Plus className="w-3.5 h-3.5" /> Add</>}
          </button>
          {editing && <button onClick={() => { setEditing(null); setForm({ subject_name: '', subject_code: '', validity_years: null, required_before_hours: null, is_mandatory: true, sort_order: 99, is_active: true }); }} className="px-4 py-2 rounded-lg text-sm transition surface-inner">Cancel</button>}
        </div>
      </div>

      {/* Subjects List */}
      {loading ? <p className="text-secondary text-center py-4">Loading...</p> : subjects.length === 0 ? <p className="text-secondary text-center py-4">No subjects defined.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}><th className="pb-3">Subject</th><th className="pb-3">Code</th><th className="pb-3">Validity</th><th className="pb-3">Before Hours</th><th className="pb-3">Actions</th></tr></thead>
            <tbody className="text-secondary">
              {subjects.map(s => (
                <tr key={s.id} className="border-b" style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
                  <td className="py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{s.subject_name}</td>
                  <td className="py-3"><span className="badge badge-accent">{s.subject_code}</span></td>
                  <td className="py-3 text-xs">{s.validity_years ? `${s.validity_years} yrs` : '—'}</td>
                  <td className="py-3 text-xs">{s.required_before_hours ? `${s.required_before_hours}h` : '—'}</td>
                  <td className="py-3">
                    <button onClick={() => handleEdit(s)} className="mr-2" style={{ color: 'var(--accent)' }} aria-label={`Edit ${s.subject_name}`}><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(s.id)} style={{ color: 'var(--danger)' }} aria-label={`Delete ${s.subject_name}`}><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget != null && (
        <ConfirmDialog
          title="Delete subject?"
          message="Delete this subject?"
          confirmLabel="Delete"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
