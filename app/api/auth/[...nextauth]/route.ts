// app/api/auth/[...nextauth]/route.ts
// NextAuth.js API route for authentication
// Handles sign‑in, JWT creation, session management
// Supports multi‑role: admin, instructor, student
//
// The actual configuration lives in lib/auth-options.ts so it can be reused
// by getServerSession() in other API routes.

import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth-options';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
