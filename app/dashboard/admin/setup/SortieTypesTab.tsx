// app/dashboard/admin/setup/SortieTypesTab.tsx
// Manage Sortie Types (Dual, Solo, Maintenance Flight)
// Controls instructor/student requirements and display colors

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';
import { Target, Pencil, Plus, Save, Trash2, CircleCheck } from 'lucide-react';

interface SortieType {
  id: number;
  type_name: string;
  type_code: string;
  color_hex: string;
  requires_instructor: boolean;
  requires_student: boolean;
  is_active: boolean;
}

// Predefined color options for the Gantt chart
const COLOR_OPTIONS = [
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Green', hex: '#16a34a' },
  { name: 'Yellow', hex: '#ca8a04' },
  { name: 'Red', hex: '#dc2626' },
  { name: 'Purple', hex: '#7c3aed' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Cyan', hex: '#0891b2' },
  { name: 'Pink', hex: '#db2777' },
  { name: 'Teal', hex: '#0d9488' },
  { name: 'Indigo', hex: '#4f46e5' },
];

export default function SortieTypesTab() {
  const [sortieTypes, setSortieTypes] = useState<SortieType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SortieType | null>(null);
  const [form, setForm] = useState({
    type_name: '',
    type_code: '',
    color_hex: '#2563eb',
    requires_instructor: true,
    requires_student: true,
    is_active: true,
  });

  const loadSortieTypes = async () => {
    setLoading(true);
    console.log('Fetching sortie types...');
    const { data, error } = await supabase
      .from('sortie_types')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error('Error loading sortie types:', error.message);
    } else {
      console.log('Loaded sortie types:', data);
      setSortieTypes(data || []);
    }
    setLoading(false);
  };

  // Load sortie types on mount
  useEffect(() => {
    loadSortieTypes();
  }, []);

  // Add or update sortie type
  const handleSave = async () => {
    if (!form.type_name || !form.type_code) return;

    if (editing) {
      await supabase.from('sortie_types').update(form).eq('id', editing.id);
    } else {
      await supabase.from('sortie_types').insert(form);
    }

    setEditing(null);
    setForm({ type_name: '', type_code: '', color_hex: '#2563eb', requires_instructor: true, requires_student: true, is_active: true });
    loadSortieTypes();
  };

  // Edit existing
  const handleEdit = (sortie: SortieType) => {
    setEditing(sortie);
    setForm({
      type_name: sortie.type_name,
      type_code: sortie.type_code,
      color_hex: sortie.color_hex,
      requires_instructor: sortie.requires_instructor,
      requires_student: sortie.requires_student,
      is_active: sortie.is_active,
    });
  };

  // Delete
  const handleDelete = async (id: number) => {
    if (window.confirm('Delete this sortie type? This may affect existing bookings.')) {
      await supabase.from('sortie_types').delete().eq('id', id);
      loadSortieTypes();
    }
  };

  const inputClass = "w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]";

  return (
    <div className="surface-card p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Target className="w-4 h-4 text-secondary" /> Sortie Types
      </h2>
      <p className="text-sm text-secondary mb-4">
        Configure the types of flights your FTO offers. Each type can have its own color, and you can specify whether an instructor or student is required.
      </p>

      {/* Add/Edit Form */}
      <div className="surface-inner p-4 mb-6">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
          {editing ? <><Pencil className="w-3.5 h-3.5" /> Edit Sortie Type</> : <><Plus className="w-3.5 h-3.5" /> Add New Sortie Type</>}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {/* Type Name */}
          <input
            type="text"
            placeholder="Display Name (e.g., Dual)"
            value={form.type_name}
            onChange={e => setForm(p => ({ ...p, type_name: e.target.value }))}
            className={inputClass}
          />

          {/* Type Code */}
          <input
            type="text"
            placeholder="Code (e.g., DUAL)"
            value={form.type_code}
            onChange={e => setForm(p => ({ ...p, type_code: e.target.value.toUpperCase() }))}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          {/* Color Picker */}
          <div>
            <label className="block text-xs text-tertiary mb-1">Gantt Chart Color</label>
            <select
              value={form.color_hex}
              onChange={e => setForm(p => ({ ...p, color_hex: e.target.value }))}
              className={inputClass}
            >
              {COLOR_OPTIONS.map(color => (
                <option key={color.hex} value={color.hex}>
                  {color.name} ({color.hex})
                </option>
              ))}
            </select>
            {/* Color Preview */}
            <div className="mt-1 flex items-center space-x-2">
              <div className="w-6 h-6 rounded" style={{ backgroundColor: form.color_hex, border: '1px solid var(--border)' }} />
              <span className="text-xs text-tertiary">{form.color_hex}</span>
            </div>
          </div>

          {/* Requires Instructor */}
          <div className="flex items-center space-x-2 pt-5">
            <input
              type="checkbox"
              checked={form.requires_instructor}
              onChange={e => setForm(p => ({ ...p, requires_instructor: e.target.checked }))}
              className="w-4 h-4"
            />
            <label className="text-sm text-secondary">Requires Instructor</label>
          </div>

          {/* Requires Student */}
          <div className="flex items-center space-x-2 pt-5">
            <input
              type="checkbox"
              checked={form.requires_student}
              onChange={e => setForm(p => ({ ...p, requires_student: e.target.checked }))}
              className="w-4 h-4"
            />
            <label className="text-sm text-secondary">Requires Student</label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2">
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm transition flex items-center gap-1.5 font-semibold"
            style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
          >
            {editing ? <><Save className="w-3.5 h-3.5" /> Update Sortie</> : <><Plus className="w-3.5 h-3.5" /> Add Sortie</>}
          </button>
          {editing && (
            <button
              onClick={() => {
                setEditing(null);
                setForm({ type_name: '', type_code: '', color_hex: '#2563eb', requires_instructor: true, requires_student: true, is_active: true });
              }}
              className="px-4 py-2 rounded-lg text-sm transition surface-inner"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Sortie Types List */}
      {loading ? (
        <p className="text-secondary text-center py-4">Loading...</p>
      ) : sortieTypes.length === 0 ? (
        <p className="text-secondary text-center py-4">No sortie types defined yet. Add your first one above.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                <th className="pb-3">Type</th>
                <th className="pb-3">Code</th>
                <th className="pb-3">Color</th>
                <th className="pb-3">Instructor</th>
                <th className="pb-3">Student</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="text-secondary">
              {sortieTypes.map(sortie => (
                <tr key={sortie.id} className="border-b" style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
                  <td className="py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{sortie.type_name}</td>
                  <td className="py-3">
                    <span
                      className="px-2 py-0.5 rounded text-xs text-white font-medium"
                      style={{ backgroundColor: sortie.color_hex }}
                    >
                      {sortie.type_code}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: sortie.color_hex }} />
                      <span className="text-xs">{sortie.color_hex}</span>
                    </div>
                  </td>
                  <td className="py-3">
                    {sortie.requires_instructor ? (
                      <span className="flex items-center gap-1" style={{ color: 'var(--success)' }}><CircleCheck className="w-3.5 h-3.5" /> Required</span>
                    ) : (
                      <span className="text-tertiary">— Not Required</span>
                    )}
                  </td>
                  <td className="py-3">
                    {sortie.requires_student ? (
                      <span className="flex items-center gap-1" style={{ color: 'var(--success)' }}><CircleCheck className="w-3.5 h-3.5" /> Required</span>
                    ) : (
                      <span className="text-tertiary">— Not Required</span>
                    )}
                  </td>
                  <td className="py-3">
                    <span className={`badge ${sortie.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {sortie.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3">
                    <button onClick={() => handleEdit(sortie)} className="mr-2" style={{ color: 'var(--accent)' }}><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(sortie.id)} style={{ color: 'var(--danger)' }}><Trash2 className="w-3.5 h-3.5" /></button>
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
