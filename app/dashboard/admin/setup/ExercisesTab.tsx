// app/dashboard/admin/setup/ExercisesTab.tsx
// Manage Exercise Codes (CCTS, ST&RE, X-CTY, etc.)
// These appear on the Gantt chart flight blocks

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';

interface Exercise {
  id: number;
  exercise_name: string;
  short_code: string;
  full_description: string;
  is_active: boolean;
  sort_order: number;
}

export default function ExercisesTab() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState({
    exercise_name: '',
    short_code: '',
    full_description: '',
    is_active: true,
    sort_order: 99,
  });

  // Load exercises on mount
  useEffect(() => {
    loadExercises();
  }, []);

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

  // Add or update exercise
  const handleSave = async () => {
    if (!form.exercise_name || !form.short_code) return;

    if (editing) {
      await supabase.from('exercises').update(form).eq('id', editing.id);
    } else {
      // Check for duplicate short code
      const exists = exercises.find(e => 
        e.short_code === form.short_code && 
        (editing ? e.id !== editing.id : true)
      );
      if (exists) {
        alert('An exercise with this short code already exists!');
        return;
      }
      await supabase.from('exercises').insert(form);
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
      await supabase.from('exercises').delete().eq('id', id);
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

  // Filtered exercises
  const filteredExercises = exercises.filter(ex =>
    ex.exercise_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ex.short_code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">📋 Exercise Codes</h2>
      <p className="text-sm text-slate-400 mb-4">
        Manage the exercise codes that appear on flight blocks in the Gantt chart. These are the short codes like CCTS, ST&RE, X-CTY.
      </p>

      {/* Add/Edit Form */}
      <div className="bg-slate-700/50 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-medium text-white mb-3">
          {editing ? '✏️ Edit Exercise' : '➕ Add New Exercise'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          {/* Exercise Name */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Exercise Name *</label>
            <input
              type="text"
              placeholder="e.g., Circuits & Landings"
              value={form.exercise_name}
              onChange={e => setForm(p => ({ ...p, exercise_name: e.target.value }))}
              className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>

          {/* Short Code */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Short Code *</label>
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="e.g., CCTS"
                value={form.short_code}
                onChange={e => setForm(p => ({ ...p, short_code: e.target.value.toUpperCase() }))}
                maxLength={6}
                className="flex-1 bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
              />
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, short_code: generateShortCode(p.exercise_name) }))}
                className="px-2 py-1 bg-slate-500 text-slate-300 rounded text-xs hover:bg-slate-400"
                title="Auto-generate from name"
              >
                🔄
              </button>
            </div>
          </div>

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
        </div>

        {/* Full Description */}
        <div className="mb-3">
          <label className="block text-xs text-slate-400 mb-1">Full Description (for dropdown)</label>
          <input
            type="text"
            placeholder="e.g., CCTS - Circuits & Landings"
            value={form.full_description}
            onChange={e => setForm(p => ({ ...p, full_description: e.target.value }))}
            className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
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
          <label className="text-sm text-slate-300">Active (visible in booking form)</label>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2">
          <button onClick={handleSave} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">
            {editing ? '💾 Update Exercise' : '➕ Add Exercise'}
          </button>
          {editing && (
            <button
              onClick={() => {
                setEditing(null);
                setForm({ exercise_name: '', short_code: '', full_description: '', is_active: true, sort_order: 99 });
              }}
              className="px-4 py-2 bg-slate-500 text-white rounded-lg text-sm hover:bg-slate-600"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="🔍 Search exercises by name or code..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white text-sm"
        />
      </div>

      {/* Exercises List */}
      {loading ? (
        <p className="text-slate-400 text-center py-4">Loading...</p>
      ) : filteredExercises.length === 0 ? (
        <p className="text-slate-400 text-center py-4">
          {searchTerm ? 'No exercises match your search.' : 'No exercises defined yet. Add your first one above.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-700">
                <th className="pb-3">Code</th>
                <th className="pb-3">Name</th>
                <th className="pb-3">Description</th>
                <th className="pb-3">Order</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {filteredExercises.map(exercise => (
                <tr key={exercise.id} className="border-b border-slate-700/50">
                  <td className="py-3">
                    <span className="text-white font-medium bg-slate-700 px-2 py-0.5 rounded text-xs">
                      {exercise.short_code}
                    </span>
                  </td>
                  <td className="py-3 text-white">{exercise.exercise_name}</td>
                  <td className="py-3 text-xs text-slate-400 max-w-[300px] truncate">
                    {exercise.full_description || '—'}
                  </td>
                  <td className="py-3 text-xs">{exercise.sort_order}</td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${exercise.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {exercise.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3">
                    <button onClick={() => handleEdit(exercise)} className="text-blue-400 hover:text-blue-300 mr-2">✏️</button>
                    <button onClick={() => handleDelete(exercise.id)} className="text-red-400 hover:text-red-300">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      <div className="mt-4 text-xs text-slate-500">
        Showing {filteredExercises.length} of {exercises.length} exercises
      </div>
    </div>
  );
}