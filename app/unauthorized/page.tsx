// app/unauthorized/page.tsx
// Shown when RoleGate blocks a logged-in user from a page their role can't
// access (e.g. an 'operations' or 'maintenance' user clicking a dashboard
// tile that's gated to other roles). This page didn't exist before, so
// RoleGate's default redirect target (fallback = '/unauthorized') was a
// dead link — every blocked click 404'd instead of showing a clean message.
// ============================================================

'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';

export default function UnauthorizedPage() {
  const { data: session } = useSession();
  // Session.user.role is declared in types/next-auth.d.ts, so no `as any`
  // cast is needed here (unlike some older call sites in this codebase).
  const role = session?.user?.role;

  // Send the user back to a dashboard their role can actually see, mirroring
  // the same role → landing page logic used right after login (see
  // components/ui/Header.tsx and app/login/page.tsx).
  const homeHref =
    role === 'student'
      ? '/dashboard/student'
      : role === 'instructor'
      ? '/dashboard/instructor'
      : '/dashboard';

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-8 w-full max-w-md text-center">
        {/* ===== ICON & HEADER ===== */}
        <div className="text-5xl mb-4">🚫</div>
        <h1 className="text-2xl font-bold text-white">Access Restricted</h1>
        <p className="text-slate-400 text-sm mt-2">
          Your account doesn&apos;t have permission to view that page.
        </p>

        {/* ===== ACTIONS ===== */}
        <div className="mt-8 space-y-3">
          <Link
            href={homeHref}
            className="block w-full py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-bold"
          >
            ← Back to my dashboard
          </Link>

          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="w-full text-sm text-slate-400 hover:text-white transition text-center"
          >
            Sign out
          </button>
        </div>

        <p className="text-xs text-slate-500 text-center mt-8">
          If you believe this is a mistake, contact your FTO administrator.
        </p>
      </div>
    </main>
  );
}