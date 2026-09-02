// app/dashboard/admin/setup/RolesTab.tsx
// Manage Instructor Roles (FI, AFI, CFI, MEI, IRI, etc.)

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { GraduationCap, Pencil, Plus, Save, Trash2 } from 'lucide-react';

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
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [form, setForm] = useState({
    role_name: '',
    role_code: '',
    description: '',
    is_active: true,
  });

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

  // Load roles on mount
  useEffect(() => {
    loadRoles();
  }, []);

  // Add or update role
  //
  // 2026-08-21 (security hardening round): routed through the shared,
  // role-checked config route instead of writing to Supabase directly from
  // the browser — see app/api/admin/config/[table]/route.ts.
  const handleSave = async () => {
    if (!form.role_name || !form.role_code) return;

    if (editing) {
      await fetch('/api/admin/config/instructor-roles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, ...form }),
      });
    } else {
      await fetch('/api/admin/config/instructor-roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
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
  const handleDelete = (id: number) => {
    setDeleteTarget(id);
  };

  const handleDeleteConfirm = async () => {
    if (deleteTarget == null) return;
    await fetch(`/api/admin/config/instructor-roles?id=${deleteTarget}`, { method: 'DELETE' });
    setDeleteTarget(null);
    loadRoles();
  };

  const inputClass = "w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]";

  return (
    <div className="surface-card p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <GraduationCap className="w-4 h-4 text-secondary" /> Instructor Roles
      </h2>
      <p className="text-sm text-secondary mb-4">
        Define the instructor roles used in your FTO. These codes appear in instructor profiles and help categorize your teaching staff.
      </p>

      {/* Add/Edit Form */}
      <div className="surface-inner p-4 mb-6">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
          {editing ? <><Pencil className="w-3.5 h-3.5" /> Edit Role</> : <><Plus className="w-3.5 h-3.5" /> Add New Role</>}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {/* Role Name */}
          <div>
            <label className="block text-xs text-tertiary mb-1">Role Name *</label>
            <input
              type="text"
              placeholder="e.g., Chief Flight Instructor"
              value={form.role_name}
              onChange={e => setForm(p => ({ ...p, role_name: e.target.value }))}
              className={inputClass}
            />
          </div>

          {/* Role Code */}
          <div>
            <label className="block text-xs text-tertiary mb-1">Role Code *</label>
            <input
              type="text"
              placeholder="e.g., CFI"
              value={form.role_code}
              onChange={e => setForm(p => ({ ...p, role_code: e.target.value.toUpperCase() }))}
              maxLength={5}
              className={inputClass}
            />
          </div>
        </div>

        {/* Description */}
        <div className="mb-3">
          <label className="block text-xs text-tertiary mb-1">Description</label>
          <input
            type="text"
            placeholder="Brief description of this role"
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
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
          <label className="text-sm text-secondary">Active</label>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2">
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm transition flex items-center gap-1.5 font-semibold"
            style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
          >
            {editing ? <><Save className="w-3.5 h-3.5" /> Update Role</> : <><Plus className="w-3.5 h-3.5" /> Add Role</>}
          </button>
          {editing && (
            <button
              onClick={() => {
                setEditing(null);
                setForm({ role_name: '', role_code: '', description: '', is_active: true });
              }}
              className="px-4 py-2 rounded-lg text-sm transition surface-inner"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Roles List */}
      {loading ? (
        <p className="text-secondary text-center py-4">Loading...</p>
      ) : roles.length === 0 ? (
        <p className="text-secondary text-center py-4">No roles defined yet. Add your first one above.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                <th className="pb-3">Code</th>
                <th className="pb-3">Role Name</th>
                <th className="pb-3">Description</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="text-secondary">
              {roles.map(role => (
                <tr key={role.id} className="border-b" style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
                  <td className="py-3">
                    <span className="badge badge-accent font-medium">
                      {role.role_code}
                    </span>
                  </td>
                  <td className="py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{role.role_name}</td>
                  <td className="py-3 text-xs text-tertiary">{role.description || '—'}</td>
                  <td className="py-3">
                    <span className={`badge ${role.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {role.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3">
                    <button onClick={() => handleEdit(role)} className="mr-2" style={{ color: 'var(--accent)' }} aria-label={`Edit ${role.role_name}`}><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(role.id)} style={{ color: 'var(--danger)' }} aria-label={`Delete ${role.role_name}`}><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget != null && (
        <ConfirmDialog
          title="Delete role?"
          message="Delete this role? Instructors with this role will be unaffected."
          confirmLabel="Delete"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
