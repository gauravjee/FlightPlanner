// app/api/send-email/route.ts
// Server-side email sending via Resend
// This avoids browser CORS issues
//
// This route sends email from the app's domain using the org's Resend API
// key, so it must not be reachable by an unauthenticated caller — otherwise
// it's an open mail relay anyone on the internet can use to send arbitrary
// HTML email (spam/phishing) "from" FlightPro Manager. The only current
// caller is the admin "create user" welcome email, so we require an
// admin/super_admin session.
import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';

const ALLOWED_ROLES = ['admin', 'super_admin'];

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;

  if (!session || !role || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { to, subject, html } = body;

    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: 'to, subject, and html are all required.' },
        { status: 400 }
      );
    }

    // Use server-side API key (no NEXT_PUBLIC_ prefix needed)
    const resend = new Resend(process.env.RESEND_API_KEY || '');

    const result = await resend.emails.send({
      from: 'FlightPro Manager <noreply@pushpak.mahesho.com>',
      to,
      subject,
      html,
    });

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error('Email error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
