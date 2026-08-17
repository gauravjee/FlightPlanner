// lib/api-auth.ts
// Shared authorization helpers for API routes.
//
// These wrap getServerSession() so every route that needs "must be logged
// in" or "must be logged in as one of these roles" can do it in one line,
// with a consistent 401/403 response shape, instead of re-implementing the
// check (and risking a copy-paste mistake) in every route.
//
// IMPORTANT: role comes from the NextAuth JWT/session (server-verified), never
// from a client-supplied header or body field — the whole point is that the
// browser cannot lie about who it is.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Re-export the role-list constants so every existing API route that does
// `import { requireRole, SOME_ROLES } from '@/lib/api-auth'` keeps working
// unchanged. The constants themselves now live in lib/permissions.ts (a
// plain-data file with no server-only imports) because 'use client' page
// components need to import them too for RoleGate checks, and this file
// pulls in lib/supabase-admin.ts below — which throws immediately if it's
// ever loaded in a browser bundle. See lib/permissions.ts for details.
export * from '@/lib/permissions';
import {
  SCHEDULE_CREATE_ROLES,
  OVERRIDE_ELIGIBLE_ROLES,
  getModuleAccessLevel,
  type ModuleKey,
  type PermissionOverrides,
} from '@/lib/permissions';

export type SessionUser = {
  email?: string | null;
  name?: string | null;
  role?: string;
  studentId?: string | null;
};

/**
 * Require a logged-in NextAuth session.
 * Returns { session } on success, or { error } (a ready-to-return
 * NextResponse) if the caller isn't authenticated.
 */
export async function requireSession(): Promise<
  { session: { user: SessionUser }; error: null } | { session: null; error: NextResponse }
> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return {
      session: null,
      error: NextResponse.json({ error: 'Not authenticated.' }, { status: 401 }),
    };
  }

  return { session: session as { user: SessionUser }, error: null };
}

/**
 * Require a logged-in session whose role is in `allowedRoles`.
 * Returns { session } on success, or { error } (a ready-to-return
 * NextResponse — 401 if not logged in at all, 403 if logged in but the
 * wrong role) otherwise.
 */
export async function requireRole(
  allowedRoles: string[]
): Promise<{ session: { user: SessionUser }; error: null } | { session: null; error: NextResponse }> {
  const { session, error } = await requireSession();
  if (error) return { session: null, error };

  const role = session.user.role;
  if (!role || !allowedRoles.includes(role)) {
    return {
      session: null,
      error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }),
    };
  }

  return { session, error: null };
}

/**
 * Require a session that's allowed to create a brand-new Schedule booking
 * (see SCHEDULE_CREATE_ROLES above for the roles that always can). For an
 * `instructor`, this additionally looks up their own instructors row (by
 * session email — the same way the client resolves "which instructor row is
 * me", e.g. app/dashboard/instructor/page.tsx) and only allows it if
 * can_self_book is true there.
 */
export async function requireScheduleCreateAccess(): Promise<
  { session: { user: SessionUser }; error: null } | { session: null; error: NextResponse }
> {
  const { session, error } = await requireSession();
  if (error) return { session: null, error };

  const role = session.user.role;
  if (role && SCHEDULE_CREATE_ROLES.includes(role)) {
    return { session, error: null };
  }

  if (role === 'instructor' && session.user.email) {
    const { data } = await supabaseAdmin
      .from('instructors')
      .select('can_self_book')
      .eq('email', session.user.email)
      .maybeSingle();
    if (data?.can_self_book) {
      return { session, error: null };
    }
  }

  return {
    session: null,
    error: NextResponse.json(
      {
        error: 'Not authorized to create a new booking. Ask a super admin to enable self-booking for your instructor profile.',
      },
      { status: 403 }
    ),
  };
}

/**
 * Require a session with at least `level` ('view' or 'full', default
 * 'full') access to `moduleKey`, per lib/permissions.ts's MODULE_ACCESS —
 * combining the session's role default with any per-user override a
 * super_admin has granted them (see the 2026-08-17 per-user permission
 * override feature).
 *
 * Only instructor/operations/maintenance sessions ever have an override
 * (OVERRIDE_ELIGIBLE_ROLES) — for every other role this is exactly
 * requireRole(MODULE_ACCESS[moduleKey].writeRoles) with no extra DB call.
 * When an override lookup IS needed, it's a fresh read of the user's own
 * row (by session email, via supabaseAdmin — never trusted from the
 * client), not anything cached on the JWT, so a grant revoked by a
 * super_admin takes effect on this user's very next request — same
 * freshness guarantee requireScheduleCreateAccess() already gives
 * can_self_book above.
 */
export async function requireModuleAccess(
  moduleKey: ModuleKey,
  level: 'view' | 'full' = 'full'
): Promise<{ session: { user: SessionUser }; error: null } | { session: null; error: NextResponse }> {
  const { session, error } = await requireSession();
  if (error) return { session: null, error };

  const role = session.user.role;

  let overrides: PermissionOverrides | null = null;
  if (role && OVERRIDE_ELIGIBLE_ROLES.includes(role) && session.user.email) {
    const { data } = await supabaseAdmin
      .from('users')
      .select('permission_overrides')
      .eq('email', session.user.email)
      .maybeSingle();
    overrides = (data?.permission_overrides as PermissionOverrides) || null;
  }

  const effectiveLevel = getModuleAccessLevel(role, overrides, moduleKey);
  const allowed = level === 'full' ? effectiveLevel === 'full' : effectiveLevel !== 'none';

  if (allowed) return { session, error: null };

  return {
    session: null,
    error: NextResponse.json({ error: 'Not authorized for this action.' }, { status: 403 }),
  };
}
