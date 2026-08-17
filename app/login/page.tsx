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
import { Plane, Mail, Lock, Eye, EyeOff, ArrowRight, Send } from 'lucide-react';
import { logLoginAttempt } from '@/lib/auth-client';
import ThemeToggle from '@/components/ui/ThemeToggle';

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
    <main className="min-h-screen flex items-center justify-center p-4 relative" style={{ backgroundColor: 'var(--bg)' }}>
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="surface-card p-8 w-full max-w-md">

        {/* ===== LOGO & HEADER ===== */}
        <div className="text-center mb-8">
          <div className="brand-mark w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Plane className="w-6 h-6" style={{ stroke: '#ffffff' }} />
          </div>
          <h1 className="text-2xl font-bold">FlightPro</h1>
          <p className="text-secondary text-sm mt-2">
            {showForgotPassword ? 'Reset Your Password' : 'Sign in to continue'}
          </p>
        </div>

        {/* ===== ERROR MESSAGE (Login) ===== */}
        {error && (
          <div className="rounded-lg p-3 mb-4" style={{ backgroundColor: 'var(--danger-soft)', border: '1px solid var(--danger)' }}>
            <p className="text-sm text-center" style={{ color: 'var(--danger)' }}>{error}</p>
          </div>
        )}

        {/* ===== RESET MESSAGE (Forgot Password) ===== */}
        {resetMessage && (
          <div
            className="rounded-lg p-3 mb-4"
            style={{
              backgroundColor: resetMessage.includes('✅') ? 'var(--success-soft)' : 'var(--danger-soft)',
              border: `1px solid ${resetMessage.includes('✅') ? 'var(--success)' : 'var(--danger)'}`,
            }}
          >
            <p className="text-sm text-center">{resetMessage.replace(/^[✅❌]\s*/, '')}</p>
          </div>
        )}

        {/* ============================================================ */}
        {/* LOGIN FORM */}
        {/* ============================================================ */}
        {!showForgotPassword ? (
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* ----- Email Field ----- */}
            <div>
              <label className="block text-sm text-secondary mb-1">Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@flightpro.com"
                  required
                  className="w-full surface-inner rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-[var(--accent)]"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            {/* ----- Password Field with Visibility Toggle ----- */}
            <div>
              <label className="block text-sm text-secondary mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full surface-inner rounded-lg pl-10 pr-12 py-3 focus:outline-none focus:border-[var(--accent)]"
                  style={{ color: 'var(--text-primary)' }}
                />
                {/* Eye icon toggle button */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-tertiary hover:text-accent transition absolute right-3 top-1/2 -translate-y-1/2"
                  tabIndex={-1}  // Prevent focus when tabbing
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                  className="w-4 h-4 rounded"
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span className="text-sm text-secondary">Remember me</span>
              </label>

              {/* Forgot Password Link */}
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-accent hover:opacity-80 transition"
              >
                Forgot Password?
              </button>
            </div>

            {/* ----- Sign In Button ----- */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg transition font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundImage: 'linear-gradient(135deg, var(--accent-strong), var(--accent))', color: '#ffffff' }}
            >
              {loading ? 'Signing in...' : (<>Sign In <ArrowRight className="w-4 h-4" /></>)}
            </button>
          </form>
        ) : (
          /* ============================================================ */
          /* FORGOT PASSWORD FORM */
          /* ============================================================ */
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <p className="text-sm text-secondary text-center">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            {/* ----- Email Field ----- */}
            <div>
              <label className="block text-sm text-secondary mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="w-full surface-inner rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-[var(--accent)]"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            {/* ----- Send Reset Link Button ----- */}
            <button
              type="submit"
              disabled={resetLoading}
              className="w-full py-3 rounded-lg transition font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundImage: 'linear-gradient(135deg, var(--accent-strong), var(--accent))', color: '#ffffff' }}
            >
              {resetLoading ? 'Sending...' : (<>Send Reset Link <Send className="w-4 h-4" /></>)}
            </button>

            {/* ----- Back to Login Link ----- */}
            <button
              type="button"
              onClick={() => {
                setShowForgotPassword(false);
                setResetMessage('');  // Clear any previous messages
              }}
              className="w-full text-sm text-secondary hover:text-accent transition text-center"
            >
              ← Back to Login
            </button>
          </form>
        )}

        {/* ===== FOOTER ===== */}
        <p className="text-xs text-tertiary text-center mt-6">
          Flight Training Organization Management System
        </p>
      </div>
    </main>
  );
}