// app/login/page.tsx
// Login page for FlightPro Manager
// Features:
//   - Email/password authentication with NextAuth
//   - Password visibility toggle (eye icon)
//   - Remember Me checkbox (persistent login)
//   - Forgot Password link → sends reset email via Resend API
//   - Force password reset check → redirects new users to /reset-password
//   - Login audit logging (tracks all attempts in login_audit table)
//   - Role-based redirect (student → /dashboard/student, others → /dashboard)
// ============================================================

'use client';

import { useState } from 'react';
import { signIn, getSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { logLoginAttempt } from '@/lib/auth-client';

export default function LoginPage() {
  // ----- Navigation -----
  const router = useRouter();

  // ============================================================
  // LOGIN FORM STATE
  // ============================================================
  const [email, setEmail] = useState('');              // User's email
  const [password, setPassword] = useState('');         // User's password
  const [rememberMe, setRememberMe] = useState(false);   // Remember Me checkbox
  const [showPassword, setShowPassword] = useState(false); // Password visibility toggle
  const [error, setError] = useState('');                // Error message display
  const [loading, setLoading] = useState(false);         // Submit button loading state

  // ============================================================
  // FORGOT PASSWORD STATE
  // ============================================================
  const [showForgotPassword, setShowForgotPassword] = useState(false); // Toggle between login and forgot password forms
  const [resetEmail, setResetEmail] = useState('');                  // Email for password reset
  const [resetMessage, setResetMessage] = useState('');              // Success/error message for reset
  const [resetLoading, setResetLoading] = useState(false);           // Loading state for reset button

  // ============================================================
  // LOGIN HANDLER
  // ============================================================

  /**
   * Handle login form submission
   * 1. Authenticates with NextAuth credentials provider
   * 2. Logs the attempt (success or failure) to login_audit table
   * 3. Checks if user needs to reset password (force_password_reset flag)
   * 4. Redirects to appropriate dashboard based on role
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();  // Prevent page reload
    setError('');         // Clear previous errors
    setLoading(true);     // Show loading state on button

    // Authenticate with NextAuth credentials provider
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,  // We handle redirect manually based on role
    });

    setLoading(false);

    if (result?.error) {
      // Login failed
      setError('Invalid email or password. Please try again.');
      await logLoginAttempt(email, 'FAILED');  // Record failed attempt in audit log
    } else {
      // Login successful
      await logLoginAttempt(email, 'SUCCESS');  // Record successful login

      // Fetch the session once — it already carries role, studentId, and
      // forcePasswordReset (populated server-side, with the service-role
      // key, inside verifyCredentials/authorize()). We used to make a
      // separate client-side `users` table read here to check
      // force_password_reset; that table is now behind Row Level Security,
      // so a browser-side read of it would just fail. Reading it off the
      // session avoids needing that read at all.
      const session = await getSession();
      const sessionUser = session?.user as any;
      const needsReset = sessionUser?.forcePasswordReset === true;
      const role = sessionUser?.role;

      if (needsReset) {
        // Redirect to password reset page with email pre-filled
        router.push(`/reset-password?email=${encodeURIComponent(email)}`);
      } else if (role === 'student') {
        router.push('/dashboard/student');  // Students see their own dashboard
      } else {
        router.push('/dashboard');  // All other roles see the main dashboard
      }
    }
  };

  // ============================================================
  // FORGOT PASSWORD HANDLER
  // ============================================================

  /**
   * Handle forgot password form submission
   * Sends a request to the server-side API route /api/auth/forgot-password
   * The API generates a reset token, stores it in the database, and emails the user
   */
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetMessage('');
    setResetLoading(true);

    try {
      // Call the server-side API to handle password reset
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      });

      const data = await response.json();

      if (response.ok) {
        // Show success message (even if email doesn't exist – security best practice)
        setResetMessage('✅ If an account with that email exists, a password reset link has been sent.');
      } else {
        setResetMessage('❌ ' + (data.error || 'Something went wrong. Please try again.'));
      }
    } catch (err) {
      setResetMessage('❌ Network error. Please try again later.');
    } finally {
      setResetLoading(false);
    }
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-8 w-full max-w-md">

        {/* ===== LOGO & HEADER ===== */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">✈️</div>
          <h1 className="text-2xl font-bold text-white">FlightPro Manager</h1>
          <p className="text-slate-400 text-sm mt-2">
            {showForgotPassword ? 'Reset Your Password' : 'Sign in to continue'}
          </p>
        </div>

        {/* ===== ERROR MESSAGE (Login) ===== */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
            <p className="text-sm text-red-400 text-center">{error}</p>
          </div>
        )}

        {/* ===== RESET MESSAGE (Forgot Password) ===== */}
        {resetMessage && (
          <div className={`rounded-lg p-3 mb-4 ${
            resetMessage.includes('✅')
              ? 'bg-green-500/10 border border-green-500/20'
              : 'bg-red-500/10 border border-red-500/20'
          }`}>
            <p className="text-sm text-center">{resetMessage}</p>
          </div>
        )}

        {/* ============================================================ */}
        {/* LOGIN FORM */}
        {/* ============================================================ */}
        {!showForgotPassword ? (
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* ----- Email Field ----- */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@flightpro.com"
                required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* ----- Password Field with Visibility Toggle ----- */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 pr-12 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                {/* Eye icon toggle button */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
                  tabIndex={-1}  // Prevent focus when tabbing
                >
                  {showPassword ? (
                    // Eye-off icon (password is visible)
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    // Eye icon (password is hidden)
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* ----- Remember Me + Forgot Password Row ----- */}
            <div className="flex items-center justify-between">
              {/* Remember Me Checkbox */}
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-400">Remember me</span>
              </label>

              {/* Forgot Password Link */}
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-blue-400 hover:text-blue-300 transition"
              >
                Forgot Password?
              </button>
            </div>

            {/* ----- Sign In Button ----- */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-bold disabled:opacity-50"
            >
              {loading ? 'Signing in...' : '🔐 Sign In'}
            </button>
          </form>
        ) : (
          /* ============================================================ */
          /* FORGOT PASSWORD FORM */
          /* ============================================================ */
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <p className="text-sm text-slate-400 text-center">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            {/* ----- Email Field ----- */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Email Address</label>
              <input
                type="email"
                value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* ----- Send Reset Link Button ----- */}
            <button
              type="submit"
              disabled={resetLoading}
              className="w-full py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-bold disabled:opacity-50"
            >
              {resetLoading ? 'Sending...' : '📧 Send Reset Link'}
            </button>

            {/* ----- Back to Login Link ----- */}
            <button
              type="button"
              onClick={() => {
                setShowForgotPassword(false);
                setResetMessage('');  // Clear any previous messages
              }}
              className="w-full text-sm text-slate-400 hover:text-white transition text-center"
            >
              ← Back to Login
            </button>
          </form>
        )}

        {/* ===== FOOTER ===== */}
        <p className="text-xs text-slate-500 text-center mt-6">
          Flight Training Organization Management System
        </p>
      </div>
    </main>
  );
}