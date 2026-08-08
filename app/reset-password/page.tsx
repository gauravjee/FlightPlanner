// app/reset-password/page.tsx
// Force Password Reset Page
// Users are redirected here when force_password_reset is true
// They must change their password before accessing the dashboard
// ============================================================

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import bcrypt from 'bcryptjs';

export default function ResetPasswordPage() {
  // ----- Hooks -----
  const router = useRouter();

  // ----- Form State -----
  const [email, setEmail] = useState('');                    // User's email
  const [oldPassword, setOldPassword] = useState('');        // Current password (to verify identity)
  const [newPassword, setNewPassword] = useState('');        // New password
  const [confirmPassword, setConfirmPassword] = useState(''); // Confirm new password
  const [error, setError] = useState('');                    // Error message
  const [loading, setLoading] = useState(false);             // Loading state for button

  // ============================================================
  // PASSWORD RESET HANDLER
  // ============================================================

  /**
   * Handle password reset form submission
   * 1. Validates passwords match and meet minimum length
   * 2. Verifies the old password is correct
   * 3. Hashes the new password and updates the database
   * 4. Clears force_password_reset flag
   * 5. Redirects to login page
   */
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // ----- Validation -----
    // Check passwords match
    if (newPassword !== confirmPassword) {
      setError('❌ Passwords do not match. Please try again.');
      return;
    }

    // Check minimum length (security requirement)
    if (newPassword.length < 8) {
      setError('❌ Password must be at least 8 characters for security.');
      return;
    }

    setLoading(true);

    try {
      // ----- Verify User Exists -----
      const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (fetchError || !user) {
        setError('❌ User not found. Please check your email address.');
        setLoading(false);
        return;
      }

      // ----- Verify Old Password -----
      const isValid = await bcrypt.compare(oldPassword, user.password_hash);
      if (!isValid) {
        setError('❌ Current password is incorrect.');
        setLoading(false);
        return;
      }

      // ----- Update Password -----
      const newHash = await bcrypt.hash(newPassword, 10);
      const { error: updateError } = await supabase
        .from('users')
        .update({
          password_hash: newHash,
          force_password_reset: false,  // Clear the force reset flag
        })
        .eq('id', user.id);

      if (updateError) {
        setError('❌ Error updating password. Please try again.');
        setLoading(false);
        return;
      }

      // ----- Success -----
      alert('✅ Password changed successfully! You can now login with your new password.');
      router.push('/login');
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
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-8 w-full max-w-md">
        
        {/* ----- Header ----- */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🔐</div>
          <h1 className="text-2xl font-bold text-white">Reset Your Password</h1>
          <p className="text-sm text-slate-400 mt-2">
            You must change your password before continuing. This is required for security on your first login.
          </p>
        </div>

        {/* ----- Error Message ----- */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* ----- Password Reset Form ----- */}
        <form onSubmit={handleReset} className="space-y-4">
          {/* Email Field */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Email Address</label>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Current Password */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Current Password</label>
            <input
              type="password"
              placeholder="Enter your current password"
              value={oldPassword}
              onChange={e => setOldPassword(e.target.value)}
              required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* New Password */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">New Password</label>
            <input
              type="password"
              placeholder="Minimum 8 characters"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1">Must be at least 8 characters</p>
          </div>

          {/* Confirm New Password */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Confirm New Password</label>
            <input
              type="password"
              placeholder="Re-enter your new password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '⏳ Resetting Password...' : '🔐 Reset Password & Login'}
          </button>
        </form>

        {/* ----- Back to Login Link ----- */}
        <p className="text-center mt-6">
          <a href="/login" className="text-sm text-slate-400 hover:text-white transition">
            ← Back to Login
          </a>
        </p>
      </div>
    </main>
  );
}