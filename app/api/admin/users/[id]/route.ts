// app/api/admin/users/[id]/route.ts
// Super-admin-only: toggle a user's active status, force a password reset,
// update per-user permission overrides, or delete an account.

import { NextResponse } from 'next/server';
import { requireRole, MODULE_KEYS, OVERRIDE_ELIGIBLE_ROLES } from '@/lib/api-auth';
import { VALID_USER_ROLES, type ModuleKey } from '@/lib/permissions';
import { supabaseAdmin } from '@/lib/supabase-admin';

const ALLOWED_ROLES = ['super_admin'];
const VALID_OVERRIDE_VALUES = ['view', 'full'];

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { session, error } = await requireRole(ALLOWED_ROLES);
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

  // action: 'editUser' (2026-08-20) expects any of { name?, email?, role? }
  // — the "Edit" action added to UserManagementTab.tsx's user table, opening
  // UserEditModal. Each field is independently optional (undefined = left
  // untouched), same convention as every other field on this route — the
  // modal only sends what the admin actually changed.
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'Name cannot be blank.' }, { status: 400 });
    }
    dbUpdates.name = name;
  }
  if (body.email !== undefined) {
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (!email) {
      return NextResponse.json({ error: 'Email cannot be blank.' }, { status: 400 });
    }
    dbUpdates.email = email;
  }
  if (body.role !== undefined) {
    if (typeof body.role !== 'string' || !VALID_USER_ROLES.includes(body.role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
    }
    if (body.role !== 'super_admin') {
      // A super_admin can't demote their OWN account away from super_admin
      // here — same reasoning as the self-delete guard on DELETE below:
      // this table is the only way to grant/revoke super_admin, so a
      // self-demotion could lock every super_admin out with no way back in
      // short of direct DB access. Identity comes from the verified
      // session (by email, matching the self-delete guard's own
      // convention), not anything the client could tamper with.
      const { data: selfCheck } = await supabaseAdmin
        .from('users')
        .select('email')
        .eq('id', id)
        .maybeSingle();
      if (selfCheck?.email === session.user.email) {
        return NextResponse.json({ error: 'You cannot change your own role away from Super Admin.' }, { status: 400 });
      }
    }
    dbUpdates.role = body.role;
  }

  // action: 'setPermissionOverrides' expects
  // { permissionOverrides: Record<ModuleKey, 'view' | 'full'> } — replaces
  // the whole column (a module key simply absent from the object means
  // "no override, use the role default"), not a merge with whatever was
  // there before. See lib/permissions.ts's MODULE_ACCESS/OVERRIDE_ELIGIBLE_
  // ROLES for what this actually controls.
  if (body.permissionOverrides !== undefined) {
    if (
      body.permissionOverrides === null ||
      typeof body.permissionOverrides !== 'object' ||
      Array.isArray(body.permissionOverrides)
    ) {
      return NextResponse.json({ error: 'permissionOverrides must be an object.' }, { status: 400 });
    }

    const raw = body.permissionOverrides as Record<string, unknown>;
    const cleaned: Partial<Record<ModuleKey, 'view' | 'full'>> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!MODULE_KEYS.includes(key as ModuleKey)) {
        return NextResponse.json({ error: `Unknown module "${key}".` }, { status: 400 });
      }
      if (!VALID_OVERRIDE_VALUES.includes(value as string)) {
        return NextResponse.json({ error: `Invalid access level for "${key}" — must be "view" or "full".` }, { status: 400 });
      }
      cleaned[key as ModuleKey] = value as 'view' | 'full';
    }

    // Defense in depth: only instructor/operations/maintenance may ever
    // carry an override, even though the UI already only offers this
    // action for those roles (UserManagementTab.tsx) — this stops a
    // crafted request from setting one on an admin/super_admin/student
    // account, where it would either be a no-op or (for student) meaningless.
    if (Object.keys(cleaned).length > 0) {
      const { data: target, error: targetError } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', id)
        .maybeSingle();

      if (targetError || !target) {
        return NextResponse.json({ error: 'User not found.' }, { status: 404 });
      }
      if (!OVERRIDE_ELIGIBLE_ROLES.includes(target.role)) {
        return NextResponse.json(
          { error: 'Permission overrides can only be set for instructor, operations, or maintenance users.' },
          { status: 400 }
        );
      }
    }

    dbUpdates.permission_overrides = cleaned;
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
    // 23505 = unique_violation — the realistic failure mode of the new
    // editUser email field (two accounts can't share an email); surfaced
    // with a specific message instead of the generic one below so the
    // admin isn't left guessing what "Failed to update user" means.
    if (dbError.code === '23505') {
      return NextResponse.json({ error: 'That email address is already in use by another account.' }, { status: 409 });
    }
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
