// app/dashboard/admin/setup/UserManagementTab.tsx
// Super Admin User Management Tab
// Features:
//   - Create new staff users (admin, instructor, operations, maintenance,
//     super_admin). Students are NOT created here — see the note by the
//     role dropdown below for why — they're created from the Students page
//     instead, which creates the login and training profile together.
//   - Auto-generate secure random passwords
//   - Send welcome emails with credentials via Resend API
//   - Force password reset on first login
//   - Toggle user active/inactive status
//   - View last login timestamps
//   - Force password reset for existing users
// ============================================================

'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Users, UserPlus, Mail, RefreshCw, Trash2, TriangleAlert, CircleCheck, ShieldCheck, Pencil } from 'lucide-react';
import { OVERRIDE_ELIGIBLE_ROLES, USER_ROLE_OPTIONS, type PermissionOverrides } from '@/lib/permissions';
import UserPermissionsModal from '@/components/admin/UserPermissionsModal';
import UserEditModal from '@/components/admin/UserEditModal';

// ============================================================
// TYPE DEFINITIONS
// ============================================================
interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  force_password_reset: boolean;
  last_login: string | null;
  created_at: string;
  permission_overrides?: PermissionOverrides | null;
}

// ============================================================
// ROLE OPTIONS – Available roles for new users
// ============================================================
// 'student' is deliberately not an option here. It used to be, but creating
// a student's login through this form never created their matching
// `students` training-profile row (and vice versa for the old "Add Student"
// flow) — the two records had no way to link up. Students are now created
// as a single unit, login + profile together, from the Students page.
//
// The role list itself now lives in lib/permissions.ts as
// USER_ROLE_OPTIONS (2026-08-20, edit-user round) — it used to be
// hand-duplicated here and, separately, as a values-only copy in
// app/api/admin/users/route.ts. Both this create form and the new
// "Edit" action's UserEditModal now share the one list.
const ROLES = USER_ROLE_OPTIONS;

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function UserManagementTab() {
  // Current admin's own session — used to stop them deleting their own account.
  const { data: session } = useSession();

  // ----- State -----
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  // Which user's "Edit Permissions" modal (if any) is currently open — see
  // components/admin/UserPermissionsModal.tsx and the 2026-08-17
  // (second round) per-user permission override feature.
  const [editingPermissionsUser, setEditingPermissionsUser] = useState<User | null>(null);
  // Which user's "Edit" (name/email/role) modal is currently open — see
  // components/admin/UserEditModal.tsx (2026-08-20).
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form state for creating new users
  const [form, setForm] = useState({
    email: '',           // User's email address
    name: '',            // User's full name
    role: 'instructor',  // Default role
    sendEmail: true,     // Whether to send welcome email
  });

  /**
   * Load all users from the database
   * Ordered by creation date (newest first)
   */
  const loadUsers = async () => {
    setLoading(true);
    // Never select password_hash here — this list renders straight into the
    // browser, and the hash has no business leaving the server. Routed
    // through /api/admin/users (super_admin only, enforced server-side)
    // rather than a direct Supabase call.
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const { users: data } = await res.json();
        setUsers(data || []);
      } else {
        console.error('Error loading users:', await res.text());
      }
    } catch (err) {
      console.error('Error loading users:', err instanceof Error ? err.message : err);
    }
    setLoading(false);
  };

  // ----- Load existing users on mount -----
  useEffect(() => {
    loadUsers();
  }, []);

  // ============================================================
  // CREATE USER
  // ============================================================

  /**
   * Create a new user account. Password generation, hashing, the insert,
   * and the welcome email are all handled server-side by
   * /api/admin/users (POST) — this just calls it and shows the result.
   */
  const handleCreateUser = async () => {
    // Validate required fields
    if (!form.email || !form.name) {
      alert('❌ Please fill in all fields.');
      return;
    }

    setSending(true);
    setSuccessMessage('');

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = await res.json();

      if (!res.ok) {
        alert('❌ Error creating user: ' + (result.error || 'Unknown error'));
        setSending(false);
        return;
      }

      if (result.emailSent) {
        setSuccessMessage(`User created! Welcome email sent to ${form.email}`);
      } else if (form.sendEmail) {
        setSuccessMessage(`User created but email failed: ${result.emailMessage}. Password: ${result.password}`);
      } else {
        setSuccessMessage(`User created! Password: ${result.password} (save this - it won't be shown again)`);
      }

      // Reset form and reload user list
      setForm({ email: '', name: '', role: 'instructor', sendEmail: true });
      loadUsers();
    } catch (err) {
      alert('❌ Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSending(false);
      // Auto-hide success message after 5 seconds
      setTimeout(() => setSuccessMessage(''), 5000);
    }
  };

  // ============================================================
  // USER MANAGEMENT ACTIONS
  // ============================================================

  /**
   * Toggle a user's active/inactive status
   * Inactive users cannot log in
   */
  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !currentStatus }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
      alert('❌ Error updating status: ' + error);
      return;
    }
    loadUsers();
  };

  /*****************************************************
   * Force a user to reset their password on next login
   * Sets force_password_reset = true
   *****************************************************/

    const forceReset = async (userId: string) => {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forcePasswordReset: true }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
        alert('❌ Error: ' + error);
        return;
      }
      loadUsers();
      alert('✅ User will be forced to reset password on next login.');
    };

  /*****************************************************
   * Delete a user permanently
   * Super admin cannot delete themselves — enforced server-side using the
   * verified NextAuth session (this client-side check is just for
   * immediate UX feedback).
   *****************************************************/

      const handleDeleteUser = async (userId: string, userEmail: string) => {
        const currentUserEmail = session?.user?.email;

        if (userEmail === currentUserEmail) {
          alert('❌ You cannot delete your own account.');
          return;
        }

        if (window.confirm(`Are you sure you want to permanently delete ${userEmail}? This action cannot be undone.`)) {
          const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });

          if (!res.ok) {
            const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
            alert('❌ Error deleting user: ' + error);
          } else {
            loadUsers();
            setSuccessMessage(`User ${userEmail} deleted successfully.`);
            setTimeout(() => setSuccessMessage(''), 3000);
          }
        }
      };

  const inputClass = "w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]";

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="surface-card p-6">
      {/* ----- Header ----- */}
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Users className="w-4 h-4 text-secondary" /> User Management
      </h2>
      <p className="text-sm text-secondary mb-4">
        Create user accounts for all roles. Welcome emails with credentials will be sent automatically.
        All new users must change their password on first login.
      </p>

      {/* ----- Success Message ----- */}
      {successMessage && (
        <div className="rounded-lg p-3 mb-4 flex items-center gap-2" style={{ backgroundColor: 'var(--success-soft)', border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)' }}>
          <CircleCheck className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--success)' }} />
          <p className="text-sm" style={{ color: 'var(--success)' }}>{successMessage}</p>
        </div>
      )}

      {/* ===== CREATE USER FORM ===== */}
      <div className="surface-inner p-4 mb-6">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
          <UserPlus className="w-3.5 h-3.5" /> Create New User
        </h3>

        {/* Email & Name */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-tertiary mb-1">Email Address *</label>
            <input
              type="email"
              placeholder="user@flightpro.com"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-tertiary mb-1">Full Name *</label>
            <input
              type="text"
              placeholder="e.g., John Doe"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className={inputClass}
            />
          </div>
        </div>

        {/* Role & Email Toggle */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-tertiary mb-1">Role</label>
            <select
              value={form.role}
              onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
              className={inputClass}
            >
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <p className="text-xs text-tertiary mt-1">
              Adding a student? Use the{' '}
              <a href="/dashboard/students" className="hover:underline" style={{ color: 'var(--accent)' }}>
                Students page
              </a>{' '}
              instead — it creates their login and training profile together.
            </p>
          </div>
          <div className="flex items-center space-x-2 pt-5">
            <input
              type="checkbox"
              checked={form.sendEmail}
              onChange={e => setForm(p => ({ ...p, sendEmail: e.target.checked }))}
              className="w-4 h-4"
            />
            <label className="text-sm text-secondary flex items-center gap-1">
              <Mail className="w-3.5 h-3.5" /> Send welcome email with credentials
            </label>
          </div>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleCreateUser}
          disabled={sending}
          className="px-4 py-2 rounded-lg text-sm transition flex items-center gap-1.5 font-semibold disabled:opacity-50"
          style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
        >
          <UserPlus className="w-3.5 h-3.5" /> {sending ? 'Creating & Sending...' : 'Create User & Send Email'}
        </button>
      </div>

      {/* ===== EXISTING USERS TABLE ===== */}
      {loading ? (
        <p className="text-secondary text-center py-4">Loading users...</p>
      ) : users.length === 0 ? (
        <p className="text-secondary text-center py-4">No users found. Create your first user above.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                <th className="pb-3">User</th>
                <th className="pb-3">Role</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">PW Reset</th>
                <th className="pb-3">Last Login</th>
                <th className="pb-3">Created</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="text-secondary">
              {users.map(user => (
                <tr key={user.id} className="border-b transition" style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
                  {/* User Info */}
                  <td className="py-3">
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{user.name}</p>
                    <p className="text-xs text-tertiary">{user.email}</p>
                  </td>

                  {/* Role Badge */}
                  <td className="py-3">
                    <span className="badge badge-accent">
                      {user.role}
                    </span>
                  </td>

                  {/* Active/Inactive Toggle */}
                  <td className="py-3">
                    <button
                      onClick={() => toggleUserStatus(user.id, user.is_active)}
                      className="px-2 py-0.5 rounded text-xs font-medium transition"
                      style={
                        user.is_active
                          ? { backgroundColor: 'var(--success-soft)', color: 'var(--success)' }
                          : { backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }
                      }
                    >
                      {user.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>

                  {/* Force Password Reset Status */}
                  <td className="py-3">
                    {user.force_password_reset ? (
                      <span className="text-xs flex items-center gap-1" style={{ color: 'var(--warning-text)' }}><TriangleAlert className="w-3.5 h-3.5" /> Required</span>
                    ) : (
                      <span className="text-xs flex items-center gap-1" style={{ color: 'var(--success)' }}><CircleCheck className="w-3.5 h-3.5" /> Done</span>
                    )}
                  </td>

                  {/* Last Login */}
                  <td className="py-3 text-xs text-tertiary">
                    {user.last_login
                      ? new Date(user.last_login).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Never'}
                  </td>

                  {/* Created Date */}
                  <td className="py-3 text-xs text-tertiary">
                    {new Date(user.created_at).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: '2-digit',
                    })}
                  </td>

                  {/* Action Buttons */}
                  <td className="py-3">
                    <div className="flex space-x-3">
                      {/* Only instructor/operations/maintenance can ever
                          carry a per-user override (OVERRIDE_ELIGIBLE_ROLES)
                          — admin/super_admin already have full access
                          everywhere, and student isn't managed from this
                          table at all. Hidden rather than disabled so it
                          doesn't imply there's something to configure for
                          roles it can never apply to. */}
                      {OVERRIDE_ELIGIBLE_ROLES.includes(user.role) && (
                        <button
                          onClick={() => setEditingPermissionsUser(user)}
                          className="text-xs transition flex items-center gap-1"
                          style={{ color: 'var(--accent)' }}
                          title="Grant this user extra module access beyond their role's default"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Permissions
                          {user.permission_overrides && Object.keys(user.permission_overrides).length > 0 && (
                            <span className="badge badge-accent" style={{ padding: '0 6px' }}>
                              {Object.keys(user.permission_overrides).length}
                            </span>
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => setEditingUser(user)}
                        className="text-xs transition flex items-center gap-1"
                        style={{ color: 'var(--accent)' }}
                        title="Edit name, email, or role"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => forceReset(user.id)}
                        className="text-xs transition flex items-center gap-1"
                        style={{ color: 'var(--accent)' }}
                        title="Force password reset on next login"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Reset PW
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id, user.email)}
                        className="text-xs transition flex items-center gap-1"
                        style={{ color: 'var(--danger)' }}
                        title="Permanently delete this user"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingPermissionsUser && (
        <UserPermissionsModal
          user={editingPermissionsUser}
          onClose={() => setEditingPermissionsUser(null)}
          onSaved={loadUsers}
        />
      )}

      {editingUser && (
        <UserEditModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={loadUsers}
        />
      )}
    </div>
  );
}
