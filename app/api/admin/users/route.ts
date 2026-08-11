// app/api/admin/users/route.ts
// Super-admin-only user account management.
//
// Matches the app's real intended policy: the entire Setup Wizard
// (app/dashboard/admin/setup/page.tsx, which hosts UserManagementTab) is
// wrapped in <RoleGate allowedRoles={['super_admin']}>, so this route uses
// the same allow-list — not the broader ['admin', 'super_admin'] that an
// earlier pass used for the email-sending route.
//
// Password generation, hashing, and the welcome email are all done here,
// server-side — the browser never sees the plaintext password beyond what
// this JSON response includes for display right after creation (matching
// the previous UX, where the admin sees the password once in a success
// message if email sending is skipped/fails).

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireRole } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendWelcomeEmailServer } from '@/lib/email';
import { generatePassword } from '@/lib/password';

const ALLOWED_ROLES = ['super_admin'];

// 'student' is intentionally NOT accepted here anymore. Creating a user
// with role='student' through this route used to leave `student_id` unset
// forever (nothing else in the app ever set it), so a student created this
// way could log in but the student portal couldn't find their training
// profile. Students are now created as a single unit — login + profile
// together — via POST /api/students. See that route for details.
const VALID_USER_ROLES = ['admin', 'instructor', 'operations', 'maintenance', 'super_admin'];

// Never select password_hash — this list is returned straight to the
// browser to render the User Management table.
const SAFE_COLUMNS = 'id, email, name, role, is_active, force_password_reset, last_login, created_at';

export async function GET() {
  const { error } = await requireRole(ALLOWED_ROLES);
  if (error) return error;

  const { data, error: dbError } = await supabaseAdmin
    .from('users')
    .select(SAFE_COLUMNS)
    .order('created_at', { ascending: false });

  if (dbError) {
    console.error('Error loading users:', dbError);
    return NextResponse.json({ error: 'Failed to load users.' }, { status: 500 });
  }

  return NextResponse.json({ users: data || [] });
}

export async function POST(request: Request) {
  const { error } = await requireRole(ALLOWED_ROLES);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const role = typeof body.role === 'string' ? body.role : 'instructor';
  const sendEmail = body.sendEmail !== false;

  if (!email || !name) {
    return NextResponse.json({ error: 'Email and name are required.' }, { status: 400 });
  }
  if (!VALID_USER_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
  }

  const password = generatePassword();
  const hash = await bcrypt.hash(password, 10);

  const { error: insertError } = await supabaseAdmin.from('users').insert({
    email,
    password_hash: hash,
    name,
    role,
    is_active: true,
    force_password_reset: true, // must change password on first login
  });

  if (insertError) {
    console.error('Error creating user:', insertError);
    return NextResponse.json({ error: insertError.message || 'Failed to create user.' }, { status: 500 });
  }

  let emailResult: { success: boolean; message: string } = {
    success: false,
    message: 'Welcome email not requested.',
  };

  if (sendEmail) {
    emailResult = await sendWelcomeEmailServer(email, name, password, role);
  }

  return NextResponse.json({
    success: true,
    emailSent: emailResult.success,
    emailMessage: emailResult.message,
    // Only returned so the admin can copy it if the email failed/was
    // skipped — same behavior as before, just generated server-side now.
    password: emailResult.success ? undefined : password,
  });
}
