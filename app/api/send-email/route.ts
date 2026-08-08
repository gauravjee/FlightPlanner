// app/api/send-email/route.ts
// Server-side email sending via Resend
// This avoids browser CORS issues
import { NextResponse } from 'next/server';
import { Resend } from 'resend';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { to, subject, html } = body;

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