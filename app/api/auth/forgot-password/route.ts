// app/api/auth/forgot-password/route.ts
// Server-side API route for password reset requests
// ============================================================
// Flow:
//   1. Receives email from the forgot password form
//   2. Checks if user exists in the database
//   3. Generates a cryptographically secure random token
//   4. Stores token with 1-hour expiry in password_reset_tokens table
//   5. Sends reset link via Resend email API
//   6. Always returns success (even if email not found – security best practice)
// ============================================================

import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';

// This route already only ever runs server-side, but it used to build its
// own anon-key Supabase client instead of reusing supabaseAdmin. Once Row
// Level Security is enabled on `users` / `password_reset_tokens`, an
// anon-key client here would silently stop finding any rows — using
// supabaseAdmin (service-role key) keeps this route working regardless of
// RLS policy changes, consistent with the other auth routes.

/**
 * POST handler for forgot password requests
 * @param request - Contains { email: string } in the request body
 * @returns JSON response with success/error message
 */
export async function POST(request: Request) {
  try {
    // Parse the email from the request body
    const { email } = await request.json();

    // Validate email is provided
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // ============================================================
    // CHECK IF USER EXISTS
    // ============================================================
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, name')
      .eq('email', email)
      .single();

    // If user doesn't exist, still return success (security best practice)
    // This prevents attackers from knowing which emails are registered
    if (userError || !user) {
      return NextResponse.json({
        success: true,
        message: 'If the email exists, a reset link has been sent.',
      });
    }

    // ============================================================
    // GENERATE RESET TOKEN
    // ============================================================
    // Use crypto.randomBytes for cryptographically secure random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Token expires in 1 hour (3600000 milliseconds)
    const tokenExpiry = new Date(Date.now() + 3600000);

    // ============================================================
    // STORE TOKEN IN DATABASE
    // ============================================================
    const { error: tokenError } = await supabaseAdmin
      .from('password_reset_tokens')
      .insert({
        user_id: user.id,
        token: resetToken,
        expires_at: tokenExpiry.toISOString(),
        used: false,  // Token starts as unused
      });

    if (tokenError) {
      console.error('Error storing reset token:', tokenError);
      return NextResponse.json(
        { error: 'Something went wrong. Please try again.' },
        { status: 500 }
      );
    }

    // ============================================================
    // SEND RESET EMAIL VIA RESEND
    // ============================================================
    const resend = new Resend(process.env.RESEND_API_KEY || '');
    
    // Build the reset URL with the token
    // Get the base URL from the request headers (works for both localhost and production)
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const host = request.headers.get('host') || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;

    // Build the reset URL with the dynamic base URL
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

    // resend.emails.send() does NOT throw on API-level failures (bad/
    // missing API key, unverified sender domain, rate limit, etc.) — it
    // resolves with { data, error }. Previously that return value was
    // discarded entirely, so any such failure was invisible: the route
    // still returned success below and the user was told to check their
    // inbox for an email that was never sent. Capturing `error` here and
    // logging it server-side (Vercel → Logs) makes real failures
    // diagnosable, while still returning the same generic success
    // response to the client — that's intentional, not an oversight: it
    // preserves the "don't reveal whether an email exists" property from
    // the comment at the top of this file. See also the reset token
    // itself, which is already stored in `password_reset_tokens` by this
    // point regardless of whether the email send below succeeds.
    const { error: sendError } = await resend.emails.send({
      from: 'FlightPro Manager <noreply@pushpak.mahesho.com>',
      to: email,
      subject: 'FlightPro - Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          
          <!-- Header -->
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1e40af;">✈️ FlightPro Manager</h1>
          </div>
          
          <!-- Message -->
          <h2 style="color: #1e293b;">Password Reset Request</h2>
          <p>We received a request to reset your password. Click the button below to create a new password.</p>
          <p style="color: #64748b; font-size: 14px;">This link will expire in <strong>1 hour</strong>.</p>
          
          <!-- Reset Button -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              🔐 Reset My Password
            </a>
          </div>
          
          <!-- Fallback link -->
          <p style="color: #64748b; font-size: 12px;">
            If the button doesn't work, copy and paste this link into your browser:<br/>
            <span style="color: #2563eb;">${resetUrl}</span>
          </p>
          
          <!-- Security notice -->
          <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin-top: 20px;">
            <p style="color: #64748b; margin: 0; font-size: 12px;">
              If you did not request a password reset, please ignore this email. Your account remains secure.
            </p>
          </div>
        </div>
      `,
    });

    if (sendError) {
      console.error('❌ Resend failed to send password reset email:', {
        to: email,
        error: sendError,
      });
      // Deliberately still return success below — see comment above.
    }

    // Return success response
    return NextResponse.json({
      success: true,
      message: 'Reset link sent! Check your email.',
    });
  } catch (error) {
    console.error('❌ Forgot password error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}