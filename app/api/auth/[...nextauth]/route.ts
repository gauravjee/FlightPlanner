// app/api/auth/[...nextauth]/route.ts
// NextAuth API route handler for App Router
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { verifyCredentials } from '@/lib/auth';

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await verifyCredentials(credentials.email, credentials.password);
        if (user) {
          return {
            id: user.id,
            email: user.email,
            name: user.name,
          };
        }
        return null;
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      // Store role in token - using type assertion to avoid TS error
      if (user) {
        (token as any).role = (user as any).role || 'instructor';
      }
      return token;
    },
    async session({ session, token }) {
      // Pass role from token to session
      if (session.user) {
        (session.user as any).role = (token as any).role || 'instructor';
      }
      return session;
    },
  },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };