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
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { supabase } from '@/lib/supabase-client';
import bcrypt from 'bcryptjs';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import Header from '@/components/ui/Header';

export default function ChangePasswordPage() {
  const router = useRouter();
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

      // Find user in database
      const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('email', userEmail)
        .single();

      if (fetchError || !user) {
        setError('❌ User not found.');
        setLoading(false);
        return;
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValid) {
        setError('❌ Current password is incorrect.');
        setLoading(false);
        return;
      }

      // Hash and update new password
      const newHash = await bcrypt.hash(newPassword, 10);
      const { error: updateError } = await supabase
        .from('users')
        .update({ 
          password_hash: newHash,
          force_password_reset: false,  // Clear any force reset flag
        })
        .eq('id', user.id);

      if (updateError) {
        setError('❌ Error updating password. Please try again.');
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
  // EYE ICONS
  // ============================================================
  const EyeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );

  const EyeOffIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <Header title="Change Password" backUrl="/dashboard" />

        <div className="max-w-md mx-auto px-4 py-12">
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-8">
            
            {/* Header */}
            <div className="text-center mb-6">
              <div className="text-4xl mb-3">🔐</div>
              <h1 className="text-2xl font-bold text-white">Change Password</h1>
              <p className="text-sm text-slate-400 mt-2">
                Enter your current password and choose a new one.
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 mb-4">
                <p className="text-sm text-green-400">{success}</p>
              </div>
            )}

            {/* Change Password Form */}
            <form onSubmit={handleChangePassword} className="space-y-4">

              {/* Current Password */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    required
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 pr-12 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  <button type="button" onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white" tabIndex={-1}>
                    {showCurrent ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">New Password</label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    required
                    minLength={8}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 pr-12 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  <button type="button" onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white" tabIndex={-1}>
                    {showNew ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">Must be at least 8 characters</p>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    required
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 pr-12 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white" tabIndex={-1}>
                    {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '⏳ Changing Password...' : '🔐 Change Password'}
              </button>
            </form>

            {/* Back to Dashboard */}
            <p className="text-center mt-6">
              <a href="/dashboard" className="text-sm text-slate-400 hover:text-white transition">
                ← Back to Dashboard
              </a>
            </p>
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}