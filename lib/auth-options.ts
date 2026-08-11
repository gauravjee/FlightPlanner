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
      }
      return token;
    },

    // Session callback – makes role and studentId available on the client
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role || 'instructor';
        session.user.studentId = token.studentId ?? null;
      }
      return session;
    },
  },

  pages: {
    signIn: '/login',   // Our custom login page
  },

  secret: process.env.NEXTAUTH_SECRET,
};
