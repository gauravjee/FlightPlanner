// app/reset-password/page.tsx
// Force Password Reset Page
// ============================================================
// Purpose: Allows users to change their password in two scenarios:
//   1. FORCED RESET: First login or admin-forced reset (force_password_reset = true)
//      - User enters email, current password, new password, confirm password
//      - Verifies current password before allowing change
//   2. TOKEN RESET: User clicked a reset link from their email
//      - Token is verified from the URL parameter
//      - User only needs to enter new password (no current password needed)
//      - Token is single-use and expires after 1 hour
//
// Features:
//   - Email pre-filled from URL parameter (when coming from login page)
//   - Token verification for email reset links (checks validity & expiry)
//   - Current password verification (for forced reset mode only)
//   - New password with confirmation field
//   - Password visibility toggles (eye icons) on all three password fields
//   - Minimum 8 character password requirement for security
//   - Clears force_password_reset flag in database after successful change
//   - Marks reset token as used after successful password change
//   - Redirects to login page after success
//   - Wrapped in Suspense boundary for Next.js compatibility with useSearchParams
// ============================================================

'use client';

// ----- React & Next.js imports -----
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// Token verification and the actual password reset both happen server-side
// (see app/api/auth/reset-password/) — the browser never sees a password
// hash, and a forced reset can only ever change the currently-logged-in
// user's own password.

// ============================================================
// EYE ICON SVG COMPONENTS
// ============================================================
// These are inline SVG icons for the password visibility toggle buttons.
// Defined at module scope (not inside ResetPasswordForm) since they're
// static — recreating them as new function identities on every render
// would reset any state/DOM they own each time the form re-renders.
// Eye-off icon: shown when password IS visible (click to hide)
// Eye icon: shown when password is HIDDEN (click to show)

/** SVG for the "eye-off" icon (password is visible, click to hide) */
const EyeOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
  </svg>
);

/** SVG for the "eye" icon (password is hidden, click to show) */
const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

// ============================================================
// INNER COMPONENT: ResetPasswordForm
// ============================================================
// This component contains all the logic and UI for the password reset form.
// It's separated from the outer component because it uses useSearchParams(),
// which requires a Suspense boundary in Next.js.
// ============================================================
function ResetPasswordForm() {

  // ============================================================
  // NAVIGATION & URL PARAMETERS
  // ============================================================
  const router = useRouter();           // For redirecting after successful reset
  const searchParams = useSearchParams(); // For reading query parameters from URL

  // ----- Extract URL parameters -----
  // 'email' parameter: passed when user is redirected from login page (forced reset)
  const emailFromUrl = searchParams.get('email') || '';
  // 'token' parameter: passed when user clicks the reset link from their email
  const resetToken = searchParams.get('token') || '';

  // ============================================================
  // FORM STATE VARIABLES
  // ============================================================
  const [email, setEmail] = useState(emailFromUrl);           // User's email (pre-filled if from URL)
  const [oldPassword, setOldPassword] = useState('');         // Current password (for forced reset only)
  const [newPassword, setNewPassword] = useState('');         // New password the user wants to set
  const [confirmPassword, setConfirmPassword] = useState(''); // Confirmation of new password (must match)
  const [error, setError] = useState('');                    // Error message to display to user
  const [loading, setLoading] = useState(false);             // Loading state for submit button

  // ----- Token verification state -----
  const [tokenVerified, setTokenVerified] = useState(false);  // Whether the reset token is valid
  
  //const [tokenEmail, setTokenEmail] = useState('');          // Email associated with the verified token

  // ----- Password visibility toggle state -----
  // Each password field has its own toggle so they can be shown/hidden independently
  const [showOldPassword, setShowOldPassword] = useState(false);      // Toggle for current password field
  const [showNewPassword, setShowNewPassword] = useState(false);      // Toggle for new password field
  const [showConfirmPassword, setShowConfirmPassword] = useState(false); // Toggle for confirm password field

  // ============================================================
  // TOKEN VERIFICATION (runs on page load if token is present)
  // ============================================================

  /**
   * Verify a password reset token from the email link
   *
   * Checks three things:
   *   1. Token exists in the password_reset_tokens table
   *   2. Token hasn't been used yet (used = false)
   *   3. Token hasn't expired (expires_at > current time)
   *
   * If valid:
   *   - Sets tokenVerified = true (switches to token reset mode)
   *   - Pre-fills the email from the associated user account
   *   - Marks the token as used so it cannot be reused
   *
   * @param token - The reset token string from the URL
   */
  const verifyToken = async (token: string) => {
    try {
      // Ask the server whether this token is still valid. This does NOT
      // mark the token as used — it's only marked used once the password
      // has actually been changed (see handleReset below), so a page
      // refresh can't burn a reset link before the user finishes the form.
      const response = await fetch('/api/auth/reset-password/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (!response.ok || !data.valid) {
        setError('❌ Invalid or expired reset link. Please request a new one from the login page.');
        return;
      }

      // Token is valid! Set up the form for token-based reset
      setTokenVerified(true);       // Switch to token reset mode (no old password needed)
      // setTokenEmail(data.email);    // Store the email associated with the token
      setEmail(data.email);         // Pre-fill the email field

    } catch {
      // Handle unexpected errors (network issues, server errors, etc.)
      setError('❌ Error verifying reset link. Please try again.');
    }
  };

  /**
   * When the page loads with a 'token' URL parameter, verify the token.
   * This useEffect runs automatically when the component mounts.
   * Dependencies: [resetToken] - re-runs if the token changes
   */
  useEffect(() => {
    if (resetToken) {
      verifyToken(resetToken);  // Verify the token from the URL
    }
  }, [resetToken]);

  // ============================================================
  // PASSWORD RESET HANDLER
  // ============================================================

  /**
   * Handle the password reset form submission
   * 
   * This function runs when the user clicks "Reset Password & Login".
   * It handles BOTH modes:
   *   - Token reset mode (tokenVerified = true): Only needs new password
   *   - Forced reset mode (tokenVerified = false): Needs current + new password
   *
   * Validation steps:
   *   1. Check new password matches confirmation
   *   2. Check new password is at least 8 characters
   *   3. Check old password is correct (forced reset mode only)
   *
   * On success:
   *   1. Hash the new password with bcrypt
   *   2. Update the user's password_hash in the database
   *   3. Clear the force_password_reset flag (so user isn't prompted again)
   *   4. Redirect to the login page
   *
   * @param e - The form submit event
   */
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();  // Prevent browser from reloading the page
    setError('');         // Clear any previous error messages

    // ============================================================
    // VALIDATION STEP 1: Check passwords match
    // ============================================================
    if (newPassword !== confirmPassword) {
      setError('❌ Passwords do not match. Please try again.');
      return;  // Stop execution - don't submit
    }

    // ============================================================
    // VALIDATION STEP 2: Check minimum password length
    // ============================================================
    // Security best practice: passwords should be at least 8 characters
    if (newPassword.length < 8) {
      setError('❌ Password must be at least 8 characters for security.');
      return;
    }

    setLoading(true);  // Show loading state on the button

    try {
      // ============================================================
      // RESET THE PASSWORD (entirely server-side)
      // ============================================================
      // Token mode: the token itself proves identity — no session needed.
      // Forced-reset mode: identity comes from the caller's NextAuth
      // session on the server (they're already logged in at this point),
      // not from the email field, so this can't touch another account.
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          tokenVerified
            ? { token: resetToken, newPassword }
            : { oldPassword, newPassword }
        ),
      });

      const data = await response.json();

      if (!response.ok) {
        setError('❌ ' + (data.error || 'Error updating password. Please try again.'));
        setLoading(false);
        return;
      }

      // ============================================================
      // SUCCESS - Password changed!
      // ============================================================
      alert('✅ Password changed successfully! You can now login with your new password.');
      router.push('/login');  // Redirect to login page

    } catch (err) {
      // Handle any unexpected errors
      setError('❌ An unexpected error occurred: ' + (err instanceof Error ? err.message : 'Please try again.'));
    } finally {
      setLoading(false);  // Always clear loading state (success or failure)
    }
  };

  // ============================================================
  // RENDER THE FORM
  // ============================================================
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-8 w-full max-w-md">

        {/* ============================================================ */}
        {/* HEADER SECTION */}
        {/* ============================================================ */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🔐</div>
          <h1 className="text-2xl font-bold text-white">
            {tokenVerified ? 'Reset Your Password' : 'Change Your Password'}
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            {tokenVerified
              ? 'Enter your new password below.'
              : 'You must change your password before continuing. This is required for security on your first login.'}
          </p>
        </div>

        {/* ============================================================ */}
        {/* ERROR MESSAGE */}
        {/* Displayed when validation fails or an error occurs */}
        {/* ============================================================ */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* ============================================================ */}
        {/* PASSWORD RESET FORM */}
        {/* ============================================================ */}
        <form onSubmit={handleReset} className="space-y-4">

          {/* ----- EMAIL FIELD ----- */}
          {/* Pre-filled from URL parameter or token verification */}
          {/* Read-only when pre-filled to prevent tampering */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Email Address</label>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              readOnly={!!emailFromUrl || tokenVerified}  // Lock the field if email was pre-filled
              className={`w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 ${(emailFromUrl || tokenVerified) ? 'opacity-75 cursor-not-allowed' : ''}`}
            />
          </div>

          {/* ----- CURRENT PASSWORD FIELD (Forced Reset Mode Only) ----- */}
          {/* Hidden when user came from email link (token reset mode) */}
          {/* User must prove their identity by entering their current password */}
          {!tokenVerified && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">Current Password</label>
              <div className="relative">
                <input
                  type={showOldPassword ? 'text' : 'password'}  // Toggle between text and password type
                  placeholder="Enter your current password"
                  value={oldPassword}
                  onChange={e => setOldPassword(e.target.value)}
                  required
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 pr-12 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                {/* Eye icon toggle button for current password */}
                <button 
                  type="button" 
                  onClick={() => setShowOldPassword(!showOldPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition" 
                  tabIndex={-1}  // Exclude from tab order (keyboard navigation)
                >
                  {showOldPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>
          )}

          {/* ----- NEW PASSWORD FIELD ----- */}
          {/* User enters their desired new password */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">New Password</label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                placeholder="Minimum 8 characters"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={8}  // Browser-level validation for minimum length
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 pr-12 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              {/* Eye icon toggle button for new password */}
              <button 
                type="button" 
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition" 
                tabIndex={-1}
              >
                {showNewPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {/* Minimum length hint */}
            <p className="text-xs text-slate-500 mt-1">Must be at least 8 characters for security</p>
          </div>

          {/* ----- CONFIRM NEW PASSWORD FIELD ----- */}
          {/* User must re-enter the same password to confirm it */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Confirm New Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 pr-12 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              {/* Eye icon toggle button for confirm password */}
              <button 
                type="button" 
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition" 
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          {/* ============================================================ */}
          {/* SUBMIT BUTTON */}
          {/* Disabled while loading (prevents double submission) */}
          {/* ============================================================ */}
          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '⏳ Resetting Password...' : '🔐 Reset Password & Login'}
          </button>
        </form>

        {/* ============================================================ */}
        {/* BACK TO LOGIN LINK */}
        {/* Provides a way for users to go back if they changed their mind */}
        {/* ============================================================ */}
        <p className="text-center mt-6">
          <a href="/login" className="text-sm text-slate-400 hover:text-white transition">
            ← Back to Login
          </a>
        </p>
      </div>
    </main>
  );
}

// ============================================================
// OUTER COMPONENT: ResetPasswordPage
// ============================================================
// This is the default export that Next.js looks for.
// It wraps the ResetPasswordForm in a Suspense boundary because
// useSearchParams() requires it for static generation compatibility.
// The fallback shows a simple loading spinner while the page loads.
// ============================================================
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Loading...</p>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}