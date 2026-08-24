// components/admin/UserEditModal.tsx
// Super_admin-only modal for editing an existing user's name, email, and
// role — added 2026-08-20 alongside the "Edit" action in
// UserManagementTab.tsx. Deliberately does NOT touch password, active
// status, force-password-reset, or permission overrides — those already
// have their own dedicated actions in the user table (toggle/Reset PW/
// Permissions) and stay separate rather than being folded into this modal.
//
// Same visual pattern as UserPermissionsModal.tsx (sibling modal, same
// table row's actions).

'use client';

import { useState } from 'react';
import { USER_ROLE_OPTIONS } from '@/lib/permissions';
import { Pencil, X, Save } from 'lucide-react';
import { useEscapeToClose } from '@/lib/useEscapeToClose';

interface UserLike {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Props {
  user: UserLike;
  onClose: () => void;
  onSaved: () => void;
}

export default function UserEditModal({ user, onClose, onSaved }: Props) {
  useEscapeToClose(onClose);
  const [form, setForm] = useState({ name: user.name, email: user.email, role: user.role });
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSave = async () => {
    const name = form.name.trim();
    const email = form.email.trim();

    if (!name || !email) {
      setErrorMessage('Name and email are required.');
      return;
    }

    setSaving(true);
    setErrorMessage('');

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role: form.role }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
        setErrorMessage(error || 'Failed to save user.');
        setSaving(false);
        return;
      }
      onSaved();
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save user.');
      setSaving(false);
    }
  };

  const inputClass = "w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]";

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="surface-card w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Pencil className="w-4 h-4" /> Edit User
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg cursor-pointer hover:opacity-80" aria-label="Close">
            <X className="w-5 h-5 text-tertiary" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {errorMessage && (
            <div className="rounded-lg p-2 text-xs" style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>
              {errorMessage}
            </div>
          )}

          <div>
            <label className="block text-xs text-tertiary mb-1">Full Name *</label>
            <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className={inputClass} />
          </div>

          <div>
            <label className="block text-xs text-tertiary mb-1">Email Address *</label>
            <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              className={inputClass} />
          </div>

          <div>
            <label className="block text-xs text-tertiary mb-1">Role</label>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
              className={inputClass}>
              {USER_ROLE_OPTIONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <p className="text-xs text-tertiary mt-1">
              Changing this immediately changes what this user can access — it doesn&apos;t affect any
              per-user permission overrides already granted to them separately.
            </p>
          </div>

          <div className="flex space-x-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg transition cursor-pointer surface-inner">
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg transition cursor-pointer font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
              style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}>
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
