// app/change-password/page.tsx
// Change Password While Logged In
// ============================================================
// Features:
//   - Requires current password verification
//   - New password with confirmation
//   - Password visibility toggles (eye icons)
//   - Minimum 8 character requirement
//   - Forces logout after successful password change
//   - Protected by authentication
// ============================================================

'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import Header from '@/components/ui/Header';
import { Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react';

export default function ChangePasswordPage() {
  const { data: session } = useSession();

  // ============================================================
  // FORM STATE
  // ============================================================
  const [currentPassword, setCurrentPassword] = useState('');        // Current password for verification
  const [newPassword, setNewPassword] = useState('');               // New password
  const [confirmPassword, setConfirmPassword] = useState('');       // Confirm new password
  const [error, setError] = useState('');                           // Error message
  const [success, setSuccess] = useState('');                       // Success message
  const [loading, setLoading] = useState(false);                    // Submit button loading state

  // Password visibility toggles
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // ============================================================
  // CHANGE PASSWORD HANDLER
  // ============================================================
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // ----- Validation -----
    if (newPassword !== confirmPassword) {
      setError('❌ New passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setError('❌ New password must be at least 8 characters.');
      return;
    }

    if (newPassword === currentPassword) {
      setError('❌ New password must be different from current password.');
      return;
    }

    setLoading(true);

    try {
      // Get current user from session
      const userEmail = session?.user?.email;
      if (!userEmail) {
        setError('❌ User session not found. Please login again.');
        setLoading(false);
        return;
      }

      // Verify current password and update it entirely server-side —
      // the password hash never comes to the browser. Identity is taken
      // from the NextAuth session on the server, not from anything sent here.
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError('❌ ' + (data.error || 'Error updating password. Please try again.'));
        setLoading(false);
        return;
      }

      // Success - show message and force logout after 2 seconds
      setSuccess('✅ Password changed successfully! You will be logged out in 2 seconds...');

      setTimeout(async () => {
        await signOut({ callbackUrl: '/login' });
      }, 2000);

    } catch (err: any) {
      setError('❌ An unexpected error occurred: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <ProtectedRoute>
      <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
        <Header title="Change Password" backUrl="/dashboard" />

        <div className="max-w-md mx-auto px-4 py-12">
          <div className="surface-card backdrop-blur-sm p-8">

            {/* Header */}
            <div className="text-center mb-6">
              <Lock className="w-10 h-10 mx-auto mb-3 text-secondary" />
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Change Password</h1>
              <p className="text-sm text-secondary mt-2">
                Enter your current password and choose a new one.
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="rounded-lg p-3 mb-4" style={{ backgroundColor: 'var(--danger-soft)', border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)' }}>
                <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="rounded-lg p-3 mb-4" style={{ backgroundColor: 'var(--success-soft)', border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)' }}>
                <p className="text-sm" style={{ color: 'var(--success)' }}>{success}</p>
              </div>
            )}

            {/* Change Password Form */}
            <form onSubmit={handleChangePassword} className="space-y-4">

              {/* Current Password */}
              <div>
                <label className="block text-sm text-secondary mb-1">Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    required
                    className="w-full surface-inner rounded-lg px-4 py-3 pr-12 focus:outline-none focus:border-[var(--accent)]"
                  />
                  <button type="button" onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-tertiary hover:text-secondary transition" tabIndex={-1}>
                    {showCurrent ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-sm text-secondary mb-1">New Password</label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    required
                    minLength={8}
                    className="w-full surface-inner rounded-lg px-4 py-3 pr-12 focus:outline-none focus:border-[var(--accent)]"
                  />
                  <button type="button" onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-tertiary hover:text-secondary transition" tabIndex={-1}>
                    {showNew ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-tertiary mt-1">Must be at least 8 characters</p>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-sm text-secondary mb-1">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    required
                    className="w-full surface-inner rounded-lg px-4 py-3 pr-12 focus:outline-none focus:border-[var(--accent)]"
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-tertiary hover:text-secondary transition" tabIndex={-1}>
                    {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg transition font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
              >
                <Lock className="w-4 h-4" /> {loading ? 'Changing Password...' : 'Change Password'}
              </button>
            </form>

            {/* Back to Dashboard */}
            <p className="text-center mt-6">
              <a href="/dashboard" className="text-sm text-tertiary hover:text-secondary transition flex items-center justify-center gap-1">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
              </a>
            </p>
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}
