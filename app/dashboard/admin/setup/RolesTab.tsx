// app/dashboard/admin/setup/RolesTab.tsx
// Manage Instructor Roles (FI, AFI, CFI, MEI, IRI, etc.)

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';

interface InstructorRole {
  id: number;
  role_name: string;
  role_code: string;
  description: string;
  is_active: boolean;
}

export default function RolesTab() {
  const [roles, setRoles] = useState<InstructorRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<InstructorRole | null>(null);
  const [form, setForm] = useState({
    role_name: '',
    role_code: '',
    description: '',
    is_active: true,
  });

  // Load roles on mount
  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    setLoading(true);
    console.log('Fetching instructor roles...');
    const { data, error } = await supabase
      .from('instructor_roles')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error('Error loading roles:', error.message);
    } else {
      console.log('Loaded roles:', data);
      setRoles(data || []);
    }
    setLoading(false);
  };

  // Add or update role
  const handleSave = async () => {
    if (!form.role_name || !form.role_code) return;

    if (editing) {
      await supabase.from('instructor_roles').update(form).eq('id', editing.id);
    } else {
      await supabase.from('instructor_roles').insert(form);
    }

    setEditing(null);
    setForm({ role_name: '', role_code: '', description: '', is_active: true });
    loadRoles();
  };

  // Edit existing
  const handleEdit = (role: InstructorRole) => {
    setEditing(role);
    setForm({
      role_name: role.role_name,
      role_code: role.role_code,
      description: role.description,
      is_active: role.is_active,
    });
  };

  // Delete
  const handleDelete = async (id: number) => {
    if (window.confirm('Delete this role? Instructors with this role will be unaffected.')) {
      await supabase.from('instructor_roles').delete().eq('id', id);
      loadRoles();
    }
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">👨‍🏫 Instructor Roles</h2>
      <p className="text-sm text-slate-400 mb-4">
        Define the instructor roles used in your FTO. These codes appear in instructor profiles and help categorize your teaching staff.
      </p>

      {/* Add/Edit Form */}
      <div className="bg-slate-700/50 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-medium text-white mb-3">
          {editing ? '✏️ Edit Role' : '➕ Add New Role'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {/* Role Name */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Role Name *</label>
            <input
              type="text"
              placeholder="e.g., Chief Flight Instructor"
              value={form.role_name}
              onChange={e => setForm(p => ({ ...p, role_name: e.target.value }))}
              className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>

          {/* Role Code */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Role Code *</label>
            <input
              type="text"
              placeholder="e.g., CFI"
              value={form.role_code}
              onChange={e => setForm(p => ({ ...p, role_code: e.target.value.toUpperCase() }))}
              maxLength={5}
              className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
        </div>

        {/* Description */}
        <div className="mb-3">
          <label className="block text-xs text-slate-400 mb-1">Description</label>
          <input
            type="text"
            placeholder="Brief description of this role"
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
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
          <label className="text-sm text-slate-300">Active</label>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2">
          <button onClick={handleSave} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">
            {editing ? '💾 Update Role' : '➕ Add Role'}
          </button>
          {editing && (
            <button
              onClick={() => {
                setEditing(null);
                setForm({ role_name: '', role_code: '', description: '', is_active: true });
              }}
              className="px-4 py-2 bg-slate-500 text-white rounded-lg text-sm hover:bg-slate-600"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Roles List */}
      {loading ? (
        <p className="text-slate-400 text-center py-4">Loading...</p>
      ) : roles.length === 0 ? (
        <p className="text-slate-400 text-center py-4">No roles defined yet. Add your first one above.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-700">
                <th className="pb-3">Code</th>
                <th className="pb-3">Role Name</th>
                <th className="pb-3">Description</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {roles.map(role => (
                <tr key={role.id} className="border-b border-slate-700/50">
                  <td className="py-3">
                    <span className="bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded text-xs font-medium">
                      {role.role_code}
                    </span>
                  </td>
                  <td className="py-3 text-white font-medium">{role.role_name}</td>
                  <td className="py-3 text-xs text-slate-400">{role.description || '—'}</td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${role.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {role.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3">
                    <button onClick={() => handleEdit(role)} className="text-blue-400 hover:text-blue-300 mr-2">✏️</button>
                    <button onClick={() => handleDelete(role.id)} className="text-red-400 hover:text-red-300">🗑️</button>
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