// proxy.ts (Next 16's renamed middleware): signed-out visitors are sent to /login on the server, before any
// dashboard page loads. Pages still do their own role checks, and every API route checks the session itself.
import { withAuth } from 'next-auth/middleware';

export default withAuth({ pages: { signIn: '/login' } });

export const config = { matcher: ['/dashboard/:path*', '/change-password'] };
