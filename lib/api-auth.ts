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

// Roles that can see/manage every student, per the app's existing intended
// policy — matches the RoleGate on app/dashboard/students/page.tsx.
export const STUDENT_STAFF_ROLES = ['admin', 'instructor', 'super_admin', 'operations'];

// Roles that can create a brand-new student. Intentionally narrower than
// STUDENT_STAFF_ROLES above: creating a student now also creates their
// login (email + generated password), and login creation has always been a
// super_admin-only action everywhere else in the app (see
// app/api/admin/users/route.ts). instructor/operations can still view and
// edit existing students' training profiles — they just can't mint new
// logins.
export const STUDENT_CREATION_ROLES = ['admin', 'super_admin'];
