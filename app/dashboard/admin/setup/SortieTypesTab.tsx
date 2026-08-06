// app/dashboard/admin/setup/SortieTypesTab.tsx
// Manage Sortie Types (Dual, Solo, Maintenance Flight)
// Controls instructor/student requirements and display colors

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';

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

  // Load sortie types on mount
  useEffect(() => {
    loadSortieTypes();
  }, []);

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

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">🎯 Sortie Types</h2>
      <p className="text-sm text-slate-400 mb-4">
        Configure the types of flights your FTO offers. Each type can have its own color, and you can specify whether an instructor or student is required.
      </p>

      {/* Add/Edit Form */}
      <div className="bg-slate-700/50 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-medium text-white mb-3">
          {editing ? '✏️ Edit Sortie Type' : '➕ Add New Sortie Type'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {/* Type Name */}
          <input
            type="text"
            placeholder="Display Name (e.g., Dual)"
            value={form.type_name}
            onChange={e => setForm(p => ({ ...p, type_name: e.target.value }))}
            className="bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
          />

          {/* Type Code */}
          <input
            type="text"
            placeholder="Code (e.g., DUAL)"
            value={form.type_code}
            onChange={e => setForm(p => ({ ...p, type_code: e.target.value.toUpperCase() }))}
            className="bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          {/* Color Picker */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Gantt Chart Color</label>
            <select
              value={form.color_hex}
              onChange={e => setForm(p => ({ ...p, color_hex: e.target.value }))}
              className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
            >
              {COLOR_OPTIONS.map(color => (
                <option key={color.hex} value={color.hex}>
                  {color.name} ({color.hex})
                </option>
              ))}
            </select>
            {/* Color Preview */}
            <div className="mt-1 flex items-center space-x-2">
              <div className="w-6 h-6 rounded border border-slate-500" style={{ backgroundColor: form.color_hex }} />
              <span className="text-xs text-slate-400">{form.color_hex}</span>
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
            <label className="text-sm text-slate-300">Requires Instructor</label>
          </div>

          {/* Requires Student */}
          <div className="flex items-center space-x-2 pt-5">
            <input
              type="checkbox"
              checked={form.requires_student}
              onChange={e => setForm(p => ({ ...p, requires_student: e.target.checked }))}
              className="w-4 h-4"
            />
            <label className="text-sm text-slate-300">Requires Student</label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2">
          <button onClick={handleSave} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">
            {editing ? '💾 Update Sortie' : '➕ Add Sortie'}
          </button>
          {editing && (
            <button
              onClick={() => {
                setEditing(null);
                setForm({ type_name: '', type_code: '', color_hex: '#2563eb', requires_instructor: true, requires_student: true, is_active: true });
              }}
              className="px-4 py-2 bg-slate-500 text-white rounded-lg text-sm hover:bg-slate-600"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Sortie Types List */}
      {loading ? (
        <p className="text-slate-400 text-center py-4">Loading...</p>
      ) : sortieTypes.length === 0 ? (
        <p className="text-slate-400 text-center py-4">No sortie types defined yet. Add your first one above.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-700">
                <th className="pb-3">Type</th>
                <th className="pb-3">Code</th>
                <th className="pb-3">Color</th>
                <th className="pb-3">Instructor</th>
                <th className="pb-3">Student</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {sortieTypes.map(sortie => (
                <tr key={sortie.id} className="border-b border-slate-700/50">
                  <td className="py-3 text-white font-medium">{sortie.type_name}</td>
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
                      <span className="text-green-400">✅ Required</span>
                    ) : (
                      <span className="text-slate-500">— Not Required</span>
                    )}
                  </td>
                  <td className="py-3">
                    {sortie.requires_student ? (
                      <span className="text-green-400">✅ Required</span>
                    ) : (
                      <span className="text-slate-500">— Not Required</span>
                    )}
                  </td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${sortie.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {sortie.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3">
                    <button onClick={() => handleEdit(sortie)} className="text-blue-400 hover:text-blue-300 mr-2">✏️</button>
                    <button onClick={() => handleDelete(sortie.id)} className="text-red-400 hover:text-red-300">🗑️</button>
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