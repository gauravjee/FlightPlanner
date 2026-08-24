// components/admin/UserPermissionsModal.tsx
// Super_admin-only modal for granting an individual instructor/operations/
// maintenance user extra module access beyond their role's own default —
// see lib/permissions.ts's MODULE_ACCESS/OVERRIDE_ELIGIBLE_ROLES and the
// 2026-08-17 (second round) per-user permission override feature. Opened
// from the "Edit Permissions" action in UserManagementTab.tsx, which
// already only shows that action for eligible roles — this modal doesn't
// re-check that itself (the PATCH route does, server-side, as the real
// enforcement — see app/api/admin/users/[id]/route.ts).

'use client';

import { useState } from 'react';
import { MODULE_KEYS, MODULE_ACCESS, type ModuleKey, type PermissionOverrides } from '@/lib/permissions';
import { ShieldCheck, X, Save } from 'lucide-react';
import { useEscapeToClose } from '@/lib/useEscapeToClose';

interface UserLike {
  id: string;
  name: string;
  email: string;
  role: string;
  permission_overrides?: PermissionOverrides | null;
}

interface Props {
  user: UserLike;
  onClose: () => void;
  onSaved: () => void;
}

// A module selector's third option, on top of the two real access levels
// a module can be overridden to — "Default" means "no override; use
// whatever this user's role already grants for this module" (which may
// itself be View Only, Full Access, or no access at all).
type SelectValue = 'default' | 'view' | 'full';

export default function UserPermissionsModal({ user, onClose, onSaved }: Props) {
  useEscapeToClose(onClose);
  const [selections, setSelections] = useState<Record<ModuleKey, SelectValue>>(() => {
    const initial = {} as Record<ModuleKey, SelectValue>;
    for (const key of MODULE_KEYS) {
      const existing = user.permission_overrides?.[key];
      initial[key] = existing === 'view' || existing === 'full' ? existing : 'default';
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setErrorMessage('');

    const permissionOverrides: Partial<Record<ModuleKey, 'view' | 'full'>> = {};
    for (const key of MODULE_KEYS) {
      const value = selections[key];
      if (value === 'view' || value === 'full') {
        permissionOverrides[key] = value;
      }
    }

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionOverrides }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
        setErrorMessage(error || 'Failed to save permissions.');
        setSaving(false);
        return;
      }
      onSaved();
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save permissions.');
      setSaving(false);
    }
  };

  const selectClass = "surface-inner rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[var(--accent)]";

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="surface-card w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Edit Permissions
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg cursor-pointer hover:opacity-80" aria-label="Close">
            <X className="w-5 h-5 text-tertiary" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{user.name}</p>
            <p className="text-xs text-tertiary">{user.email} &middot; role: {user.role}</p>
          </div>

          <p className="text-xs text-secondary">
            Grants this specific user extra access to a module beyond what their{' '}
            <span className="font-medium">{user.role}</span> role gets by default — leave a module on
            &ldquo;Default&rdquo; to keep their normal role-based access for it. This never affects any other{' '}
            {user.role} user, and doesn&apos;t grant creating new students/logins, which stays
            admin/super_admin-only regardless.
          </p>

          {errorMessage && (
            <div className="rounded-lg p-2 text-xs" style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>
              {errorMessage}
            </div>
          )}

          <div className="space-y-2">
            {MODULE_KEYS.map((key) => (
              <div key={key} className="surface-inner p-3 flex items-center justify-between gap-3">
                <span className="text-sm">{MODULE_ACCESS[key].label}</span>
                <select
                  value={selections[key]}
                  onChange={e => setSelections(prev => ({ ...prev, [key]: e.target.value as SelectValue }))}
                  className={selectClass}
                >
                  <option value="default">Default (role-based)</option>
                  <option value="view">View Only</option>
                  <option value="full">Full Access</option>
                </select>
              </div>
            ))}
          </div>

          <div className="flex space-x-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg transition cursor-pointer surface-inner">
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg transition cursor-pointer font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
              style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}>
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Permissions'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
