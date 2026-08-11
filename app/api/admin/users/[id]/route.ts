// app/api/admin/users/[id]/route.ts
// Super-admin-only: toggle a user's active status, force a password reset,
// or delete an account.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const ALLOWED_ROLES = ['super_admin'];

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { error } = await requireRole(ALLOWED_ROLES);
  if (error) return error;

  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const dbUpdates: Record<string, unknown> = {};

  // action: 'toggleStatus' expects { isActive: boolean }
  if (typeof body.isActive === 'boolean') {
    dbUpdates.is_active = body.isActive;
  }
  // action: 'forceReset' expects { forcePasswordReset: true }
  if (typeof body.forcePasswordReset === 'boolean') {
    dbUpdates.force_password_reset = body.forcePasswordReset;
  }

  if (Object.keys(dbUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  const { error: dbError } = await supabaseAdmin
    .from('users')
    .update(dbUpdates)
    .eq('id', id);

  if (dbError) {
    console.error('Error updating user:', dbError);
    return NextResponse.json({ error: 'Failed to update user.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { session, error } = await requireRole(ALLOWED_ROLES);
  if (error) return error;

  const { id } = await context.params;

  // Server-side self-delete guard — identity comes from the verified
  // session, not anything the client could tamper with. (The client also
  // does a UX-level check before calling this, but that alone was
  // previously broken and non-functional — see UserManagementTab.tsx.)
  const { data: target, error: fetchError } = await supabaseAdmin
    .from('users')
    .select('email')
    .eq('id', id)
    .single();

  if (fetchError || !target) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  if (target.email === session.user.email) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
  }

  const { error: dbError } = await supabaseAdmin.from('users').delete().eq('id', id);

  if (dbError) {
    console.error('Error deleting user:', dbError);
    return NextResponse.json({ error: 'Failed to delete user.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
