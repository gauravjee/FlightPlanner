// types/next-auth.d.ts
// Extend NextAuth types to include role and studentId
import 'next-auth';

declare module 'next-auth' {
  interface User {
    role?: string;
    studentId?: string | null;
    forcePasswordReset?: boolean;
  }

  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string;
      studentId?: string | null;
      forcePasswordReset?: boolean;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: string;
    studentId?: string | null;
    forcePasswordReset?: boolean;
    checkedAt?: number;      // ms timestamp of the last users-row re-read (see lib/auth-options.ts)
    deactivated?: boolean;   // set once the account is found inactive/deleted
  }
}
