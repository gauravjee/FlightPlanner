// types/next-auth.d.ts
// Extend NextAuth types to include role and studentId
import 'next-auth';

declare module 'next-auth' {
  interface User {
    role?: string;
    studentId?: string | null;
  }

  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string;
      studentId?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: string;
    studentId?: string | null;
  }
}
