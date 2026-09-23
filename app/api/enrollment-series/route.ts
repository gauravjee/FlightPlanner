// app/api/enrollment-series/route.ts
// Student enrollment-number series (2026-09-24; add-enrollment-series.sql,
// lib/enrollment.ts). GET lists every series with its next / last-issued
// number (the Add Student form shows the next one); PUT makes a prefix the
// current series — creating it with a starting number if it's new. A
// prefix's starting number is locked once it has issued a number. Numbers
// themselves are issued only by next_enrollment_id() when a student is
// created (app/api/students/route.ts POST).

import { NextResponse } from 'next/server';
import { requireRole, STUDENT_CREATION_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ENROLLMENT_PREFIX_RE, parseStartNumber, formatEnrollmentId } from '@/lib/enrollment';

const SETUP_ROLES = ['admin', 'super_admin'];

type Row = { prefix: string; start_number: number; width: number; next_number: number; is_current: boolean; created_at: string };

export async function GET() {
  const { error } = await requireRole(STUDENT_CREATION_ROLES);
  if (error) return error;

  const { data, error: dbError } = await supabaseAdmin
    .from('enrollment_series').select('*').order('created_at', { ascending: false });
  if (dbError) {
    console.error('Error loading enrollment series:', dbError);
    return NextResponse.json({ error: 'Failed to load enrollment numbers.' }, { status: 500 });
  }

  const series = ((data || []) as Row[]).map(r => {
    const used = r.next_number > r.start_number;
    return {
      prefix: r.prefix,
      startNumber: String(r.start_number).padStart(r.width, '0'),
      isCurrent: r.is_current,
      used,
      next: formatEnrollmentId(r.prefix, r.next_number, r.width),
      lastIssued: used ? formatEnrollmentId(r.prefix, r.next_number - 1, r.width) : null,
    };
  });
  return NextResponse.json({ series });
}

export async function PUT(request: Request) {
  const { error } = await requireRole(SETUP_ROLES);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const prefix = typeof body.prefix === 'string' ? body.prefix.trim() : '';
  if (!ENROLLMENT_PREFIX_RE.test(prefix)) {
    return NextResponse.json({ error: 'Prefix: up to 30 letters, digits, "-" or "/", no spaces (e.g. HFA2026-27).' }, { status: 400 });
  }
  const parsed = parseStartNumber(typeof body.startNumber === 'string' ? body.startNumber : '');

  const { data } = await supabaseAdmin
    .from('enrollment_series').select('*').eq('prefix', prefix).maybeSingle();
  const existing = data as Row | null;

  if (!existing) {
    if (!parsed) {
      return NextResponse.json({ error: 'Enter a starting number for the new prefix, e.g. 0001 or 1001.' }, { status: 400 });
    }
    const { error: insertError } = await supabaseAdmin.from('enrollment_series').insert({
      prefix, start_number: parsed.start, width: parsed.width, next_number: parsed.start, is_current: false,
    });
    if (insertError) {
      console.error('Error creating enrollment series:', insertError);
      return NextResponse.json({ error: 'Failed to save enrollment numbers.' }, { status: 500 });
    }
  } else if (parsed && (parsed.start !== existing.start_number || parsed.width !== existing.width)) {
    // Changing the starting number is only allowed before the first number is issued.
    if (existing.next_number > existing.start_number) {
      return NextResponse.json({ error: `${prefix} has already issued numbers — its starting number can't be changed.` }, { status: 400 });
    }
    const { error: updateError } = await supabaseAdmin.from('enrollment_series')
      .update({ start_number: parsed.start, width: parsed.width, next_number: parsed.start }).eq('prefix', prefix);
    if (updateError) {
      console.error('Error updating enrollment series:', updateError);
      return NextResponse.json({ error: 'Failed to save enrollment numbers.' }, { status: 500 });
    }
  }

  // Make it the current series (clear the old one first — one-current index).
  const { error: clearError } = await supabaseAdmin.from('enrollment_series')
    .update({ is_current: false }).eq('is_current', true).neq('prefix', prefix);
  const { error: setError } = clearError ? { error: clearError } : await supabaseAdmin.from('enrollment_series')
    .update({ is_current: true }).eq('prefix', prefix);
  if (setError) {
    console.error('Error setting current enrollment series:', setError);
    return NextResponse.json({ error: 'Failed to save enrollment numbers.' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
