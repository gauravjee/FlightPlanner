// lib/auth-options.ts
// Shared NextAuth configuration.
//
// This is exported separately from app/api/auth/[...nextauth]/route.ts so that
// server-side code (API routes, Server Actions) can call
// `getServerSession(authOptions)` to find out who's making a request, without
// having to import from a route.ts file.
import type { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { verifyCredentials, isLockedOut, recordLoginAttempt } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

// How often a live session re-reads its users row (is_active, role). A
// deactivated account or changed role takes effect within this window
// instead of whenever the JWT happens to expire.
const ACCOUNT_RECHECK_MS = 5 * 60 * 1000;

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        // Brute-force guard: 5 failures per email per 15 minutes. Thrown
        // (not `return null`) so the login page can show a distinct message
        // — NextAuth surfaces the message as signIn()'s `error`.
        if (await isLockedOut(credentials.email)) {
          throw new Error('TOO_MANY_ATTEMPTS');
        }

        // Verify the user against our database
        const user = await verifyCredentials(
          credentials.email,
          credentials.password
        );

        // Server-authoritative audit trail (replaces the browser-side write).
        const headers = req?.headers ?? {};
        await recordLoginAttempt(
          credentials.email,
          user ? 'SUCCESS' : 'FAILED',
          String(headers['x-forwarded-for'] ?? '').split(',')[0].trim(),
          String(headers['user-agent'] ?? '')
        );

        if (user) {
          // Return user object – these fields will be stored in the JWT
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,                   // 'admin' | 'instructor' | 'student'
            studentId: user.studentId || null,  // only for students
            forcePasswordReset: user.forcePasswordReset ?? false,
          };
        }
        return null;
      },
    }),
  ],

  session: {
    strategy: 'jwt',   // Use JSON Web Tokens (stateless)
    // 8 hours (was NextAuth's 30-day default). NextAuth re-issues the cookie
    // on each session read, so this is an idle/absolute-ish cap, not a hard
    // 8h wall while someone is actively working.
    maxAge: 8 * 60 * 60,
  },

  callbacks: {
    // JWT callback – called when a token is created or updated
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role || 'instructor';
        token.studentId = user.studentId ?? null;
        token.forcePasswordReset = user.forcePasswordReset ?? false;
        token.checkedAt = Date.now();
        return token;
      }

      // Later requests: JWTs are stateless, so a deactivated user's token
      // would otherwise stay valid until it expires. Re-read the account
      // at most every ACCOUNT_RECHECK_MS. Tokens issued before this change
      // have no `checkedAt`, so they get checked on their next request.
      // A DB error leaves the token untouched and retries next request —
      // a Supabase blip must not log everyone out.
      if (
        token.email &&
        !token.deactivated &&
        Date.now() - (token.checkedAt ?? 0) > ACCOUNT_RECHECK_MS
      ) {
        const { data, error } = await supabaseAdmin
          .from('users')
          .select('is_active, role')
          .eq('email', token.email)
          .maybeSingle();

        if (!error) {
          if (data?.is_active) {
            token.role = data.role || token.role;
            token.checkedAt = Date.now();
          } else {
            token.deactivated = true; // inactive, or the row is gone
          }
        }
      }
      return token;
    },

    // Session callback – makes role/studentId/forcePasswordReset available
    // on the client. forcePasswordReset lets the login page decide whether
    // to redirect to /reset-password WITHOUT making its own client-side
    // `users` table read — that table is now behind Row Level Security, so
    // a browser-side (anon-key) read of it would just fail. This value was
    // already fetched server-side (with the service-role key) inside
    // verifyCredentials/authorize() above, so it's free to expose here.
    async session({ session, token }) {
      // Deactivated/deleted account: return an EMPTY session object. NextAuth
      // (v4.24, core/routes/session.js + getServerSession) treats {} as "no
      // session": getServerSession() returns null (every API route answers
      // 401) and the browser's useSession() flips to 'unauthenticated', so
      // ProtectedRoute sends the user to /login. Returning { user: {} }
      // instead would look logged-in to the client and leave them on the
      // dashboard staring at empty pages.
      if (token.deactivated) return {} as typeof session;

      if (session.user) {
        session.user.role = token.role || 'instructor';
        session.user.studentId = token.studentId ?? null;
        session.user.forcePasswordReset = token.forcePasswordReset ?? false;
      }
      return session;
    },
  },

  pages: {
    signIn: '/login',   // Our custom login page
  },

  secret: process.env.NEXTAUTH_SECRET,
};
