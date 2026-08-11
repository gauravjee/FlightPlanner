// lib/email.ts
// Email notification service using Resend (free tier: 100 emails/day)
// Handles welcome emails for new users and password reset emails
// Uses lazy initialization to avoid errors when API key is missing
// ============================================================

import { Resend } from 'resend';

// ============================================================
// ROLE LABELS – Human-readable names for each role
// ============================================================
const roleLabels: Record<string, string> = {
  admin: 'Administrator',
  instructor: 'Flight Instructor',
  student: 'Student Pilot',
  super_admin: 'Super Admin',
  maintenance: 'Maintenance Team',
  operations: 'Operations Team',
};

// ============================================================
// GET RESEND CLIENT (lazy initialization)
// ============================================================
let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (resendClient) return resendClient;

  // Server-only key — must NOT have a NEXT_PUBLIC_ prefix, or it would be
  // bundled into client-side JS and leak the Resend account's API key to
  // every visitor. (This function is only ever called from server code,
  // but keep the env var name safe regardless.)
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey || apiKey === 're_your_key_here') {
    console.warn('⚠️ Resend API key not configured. Emails will not be sent.');
    return null;
  }
  
  resendClient = new Resend(apiKey);
  return resendClient;
}

// ============================================================
// SEND WELCOME EMAIL
// ============================================================
export async function sendWelcomeEmail(
  email: string,
  name: string,
  password: string,
  role: string
): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        subject: `Welcome to FlightPro - Your ${roleLabels[role] || role} Account`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1e40af;">✈️ FlightPro Manager</h1>
              <p style="color: #64748b;">Flight Training Organization Management System</p>
            </div>
            <h2 style="color: #1e293b;">Welcome, ${name}!</h2>
            <p>Your <strong>${roleLabels[role] || role}</strong> account has been created.</p>
            <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>🔗 Login URL:</strong> <a href="https://flightplanner-xi.vercel.app/login">FlightPro Login</a></p>
              <p><strong>📧 Email:</strong> ${email}</p>
              <p><strong>🔑 Password:</strong> ${password}</p>
            </div>
            <div style="background: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b;">
              <p style="color: #92400e; margin: 0;">⚠️ <strong>Important:</strong> You will be required to change your password on your first login.</p>
            </div>
          </div>
        `,
      }),
    });

    if (response.ok) {
      return { success: true, message: 'Welcome email sent!' };
    } else {
      const data = await response.json();
      return { success: false, message: data.error || 'Failed to send email' };
    }
  } catch (error: any) {
    console.error('Email send error:', error);
    return { success: false, message: error.message };
  }
}
// ============================================================
// SEND WELCOME EMAIL (server-side)
// ============================================================
// Same content as sendWelcomeEmail() above, but calls Resend directly
// instead of going through a self-fetch to /api/send-email. Use this from
// server-side code (API routes) that already has an authorized admin
// session — e.g. app/api/admin/users/route.ts when creating a new user —
// so account creation doesn't need an extra authenticated HTTP hop.
export async function sendWelcomeEmailServer(
  email: string,
  name: string,
  password: string,
  role: string
): Promise<{ success: boolean; message: string }> {
  const resend = getResend();

  if (!resend) {
    return { success: false, message: 'Email service not configured.' };
  }

  try {
    await resend.emails.send({
      from: 'FlightPro Manager <noreply@pushpak.mahesho.com>',
      to: email,
      subject: `Welcome to FlightPro - Your ${roleLabels[role] || role} Account`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1e40af;">✈️ FlightPro Manager</h1>
            <p style="color: #64748b;">Flight Training Organization Management System</p>
          </div>
          <h2 style="color: #1e293b;">Welcome, ${name}!</h2>
          <p>Your <strong>${roleLabels[role] || role}</strong> account has been created.</p>
          <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>🔗 Login URL:</strong> <a href="https://flightplanner-xi.vercel.app/login">FlightPro Login</a></p>
            <p><strong>📧 Email:</strong> ${email}</p>
            <p><strong>🔑 Password:</strong> ${password}</p>
          </div>
          <div style="background: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b;">
            <p style="color: #92400e; margin: 0;">⚠️ <strong>Important:</strong> You will be required to change your password on your first login.</p>
          </div>
        </div>
      `,
    });

    return { success: true, message: 'Welcome email sent!' };
  } catch (error) {
    console.error('❌ Welcome email send error:', error);
    const message = error instanceof Error ? error.message : 'Failed to send welcome email.';
    return { success: false, message };
  }
}

// ============================================================
// SEND PASSWORD RESET EMAIL
// ============================================================
export async function sendPasswordResetEmail(
  email: string,
  resetToken: string
): Promise<{ success: boolean; message: string }> {
  const resend = getResend();
  
  if (!resend) {
    return { 
      success: false, 
      message: 'Email service not configured.' 
    };
  }

  try {
    const resetUrl = `https://flightplanner-xi.vercel.app/reset-password?token=${resetToken}`;

    await resend.emails.send({
      from: 'FlightPro Manager <noreply@pushpak.mahesho.com>',
      to: email,
      subject: 'FlightPro - Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #1e40af;">✈️ FlightPro Manager</h1>
          <h2>Password Reset Request</h2>
          <p>Click the button below to reset your password. This link expires in 1 hour.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
              🔐 Reset My Password
            </a>
          </div>
          <p style="color: #64748b;">If you did not request this, please ignore this email.</p>
        </div>
      `,
    });

    return { success: true, message: 'Password reset email sent!' };
  } catch (error: any) {
    console.error('❌ Email send error:', error);
    return { success: false, message: error.message };
  }
}