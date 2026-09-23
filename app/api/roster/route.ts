// app/api/roster/route.ts
// Instructor duty roster (2026-09-23; claude/duty-roster-design-2026-09-23.md).
//  GET    — the whole roster: weekly pattern rows + one-off exceptions.
//           ROSTER_VIEW_ROLES (instructors see it read-only). Both tables are
//           small (≤ 7 rows per instructor + a row per changed date), so no
//           date filter.
//  PUT    — save one instructor's weekly pattern: all 7 days at once, each
//           { weekday, startTime, endTime } with both times null = off.
//           Always all 7 — a missing weekday would silently read as "off".
//  POST   — set a one-off exception { instructorId, date, startTime, endTime,
//           note } (both times null = off that day). One per instructor/date.
//  DELETE — ?instructorId=&date= removes that exception.
// Writes: ROSTER_EDIT_ROLES (admin, super_admin, operations). Needs
// add-instructor-roster.sql. The rule that reads all this is lib/roster.ts.

import { NextResponse } from 'next/server';
import { requireRole, ROSTER_VIEW_ROLES, ROSTER_EDIT_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const TIME = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Both null (off), or both valid 'HH:MM' with end after start. Returns an
// error message, or null when fine.
function badTimes(start: unknown, end: unknown): string | null {
  if (start === null && end === null) return null;
  if (typeof start !== 'string' || typeof end !== 'string' || !TIME.test(start) || !TIME.test(end)) {
    return 'Times must be HH:MM (or both empty for a day off).';
  }
  return end > start ? null : 'End time must be after start time.';
}

async function instructorExists(id: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('instructors').select('id').eq('id', id).maybeSingle();
  return !!data;
}

export async function GET() {
  const { error } = await requireRole(ROSTER_VIEW_ROLES);
  if (error) return error;

  const [weekly, exceptions] = await Promise.all([
    supabaseAdmin.from('instructor_roster').select('instructor_id, weekday, start_time, end_time, updated_by, updated_at'),
    supabaseAdmin.from('instructor_roster_exceptions').select('id, instructor_id, date, start_time, end_time, note, created_by').order('date'),
  ]);
  if (weekly.error || exceptions.error) {
    console.error('Error loading roster:', weekly.error || exceptions.error);
    return NextResponse.json({ error: 'Failed to load the duty roster.' }, { status: 500 });
  }
  return NextResponse.json({ weekly: weekly.data, exceptions: exceptions.data });
}

export async function PUT(request: Request) {
  const { session, error } = await requireRole(ROSTER_EDIT_ROLES);
  if (error) return error;

  const body = await request.json().catch(() => null);
  const instructorId = String(body?.instructorId ?? '');
  const days = Array.isArray(body?.days) ? body.days : null;
  if (!instructorId || !days || days.length !== 7
    || new Set(days.map((d: { weekday?: unknown }) => d?.weekday)).size !== 7
    || days.some((d: { weekday?: unknown }) => !Number.isInteger(d?.weekday) || (d.weekday as number) < 0 || (d.weekday as number) > 6)) {
    return NextResponse.json({ error: 'Send all 7 days (weekday 0–6, each once).' }, { status: 400 });
  }
  for (const d of days) {
    const bad = badTimes(d.startTime ?? null, d.endTime ?? null);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  }
  if (!(await instructorExists(instructorId))) return NextResponse.json({ error: 'Instructor not found.' }, { status: 404 });

  const updatedBy = session.user.name || session.user.email || '';
  const { error: dbError } = await supabaseAdmin.from('instructor_roster').upsert(
    days.map((d: { weekday: number; startTime?: string | null; endTime?: string | null }) => ({
      instructor_id: instructorId, weekday: d.weekday,
      start_time: d.startTime ?? null, end_time: d.endTime ?? null,
      updated_by: updatedBy, updated_at: new Date().toISOString(),
    })),
    { onConflict: 'instructor_id,weekday' },
  );
  if (dbError) {
    console.error('Error saving roster:', dbError);
    return NextResponse.json({ error: 'Failed to save the roster.' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function POST(request: Request) {
  const { session, error } = await requireRole(ROSTER_EDIT_ROLES);
  if (error) return error;

  const body = await request.json().catch(() => null);
  const instructorId = String(body?.instructorId ?? '');
  const date = String(body?.date ?? '');
  const startTime = body?.startTime ?? null;
  const endTime = body?.endTime ?? null;
  if (!instructorId || !DATE.test(date)) {
    return NextResponse.json({ error: 'instructorId and date (YYYY-MM-DD) are required.' }, { status: 400 });
  }
  const bad = badTimes(startTime, endTime);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  if (!(await instructorExists(instructorId))) return NextResponse.json({ error: 'Instructor not found.' }, { status: 404 });

  const { error: dbError } = await supabaseAdmin.from('instructor_roster_exceptions').upsert({
    instructor_id: instructorId, date, start_time: startTime, end_time: endTime,
    note: typeof body?.note === 'string' ? body.note.slice(0, 200) : '',
    created_by: session.user.name || session.user.email || '',
  }, { onConflict: 'instructor_id,date' });
  if (dbError) {
    console.error('Error saving roster exception:', dbError);
    return NextResponse.json({ error: 'Failed to save the change for that day.' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const { error } = await requireRole(ROSTER_EDIT_ROLES);
  if (error) return error;

  const url = new URL(request.url);
  const instructorId = url.searchParams.get('instructorId') ?? '';
  const date = url.searchParams.get('date') ?? '';
  if (!instructorId || !DATE.test(date)) {
    return NextResponse.json({ error: 'instructorId and date (YYYY-MM-DD) are required.' }, { status: 400 });
  }
  const { data, error: dbError } = await supabaseAdmin.from('instructor_roster_exceptions')
    .delete().eq('instructor_id', instructorId).eq('date', date).select('id');
  if (dbError) {
    console.error('Error removing roster exception:', dbError);
    return NextResponse.json({ error: 'Failed to remove the change for that day.' }, { status: 500 });
  }
  if (!data?.length) return NextResponse.json({ error: 'No change found for that day.' }, { status: 404 });
  return NextResponse.json({ success: true });
}
