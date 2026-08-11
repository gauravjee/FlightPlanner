// lib/auth-options.ts
// Shared NextAuth configuration.
//
// This is exported separately from app/api/auth/[...nextauth]/route.ts so that
// server-side code (API routes, Server Actions) can call
// `getServerSession(authOptions)` to find out who's making a request, without
// having to import from a route.ts file.
import type { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { verifyCredentials } from '@/lib/auth';

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Verify the user against our database
        const user = await verifyCredentials(
          credentials.email,
          credentials.password
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
  },

  callbacks: {
    // JWT callback – called when a token is created or updated
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role || 'instructor';
        token.studentId = user.studentId ?? null;
        token.forcePasswordReset = user.forcePasswordReset ?? false;
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
