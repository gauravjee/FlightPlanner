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
//
// Multi-base M4a (15 Oct): every write takes a baseId (missing = Base 1) and
// touches only that base's rows (needs roster-per-base.sql). Q9: a write is
// refused when it would make the instructor's hours at two bases overlap.

import { NextResponse } from 'next/server';
import { requireRole, ROSTER_VIEW_ROLES, ROSTER_EDIT_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rosterOverlap, rowBase, type WeeklyRow, type RosterException } from '@/lib/roster';
import { toIST } from '@/lib/leave-window';

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

/** The base a write is for: missing = Base 1; anything else must be an active base. Null = refuse. */
async function writeBase(raw: unknown): Promise<number | null> {
  const id = raw == null || raw === '' ? 1 : Number(raw);
  if (!Number.isInteger(id) || id < 1) return null;
  const { data } = await supabaseAdmin.from('bases').select('id').eq('id', id).eq('is_active', true).maybeSingle();
  return data ? id : null;
}

/**
 * Q9: loads the instructor's roster at every base, applies the proposed change, and returns a
 * refusal if two bases would overlap on any day (or null). Fails closed if the roster can't load.
 * shortcut: check-then-write, not one transaction; two admins saving the same instructor at the same
 * moment could slip past it. Fine at this school's size; move into a DB function if that changes.
 */
async function overlapAfter(
  instructorId: string,
  change: (weekly: WeeklyRow[], exceptions: RosterException[]) => [WeeklyRow[], RosterException[]],
): Promise<string | null> {
  const today = toIST(new Date().toISOString()).date;
  const [weekly, exceptions, bases] = await Promise.all([
    supabaseAdmin.from('instructor_roster').select('base_id, weekday, start_time, end_time').eq('instructor_id', instructorId),
    supabaseAdmin.from('instructor_roster_exceptions').select('base_id, date, start_time, end_time').eq('instructor_id', instructorId).gte('date', today),
    supabaseAdmin.from('bases').select('id, name'),
  ]);
  if (weekly.error || exceptions.error || bases.error) {
    console.error('Error loading roster for the overlap check:', weekly.error || exceptions.error || bases.error);
    return "Couldn't check this roster against the instructor's other bases — please try again.";
  }
  const [w, e] = change(
    (weekly.data ?? []).map(r => ({ instructorId, baseId: Number(r.base_id ?? 1), weekday: Number(r.weekday), startTime: r.start_time as string | null, endTime: r.end_time as string | null })),
    (exceptions.data ?? []).map(r => ({ instructorId, baseId: Number(r.base_id ?? 1), date: String(r.date), startTime: r.start_time as string | null, endTime: r.end_time as string | null })),
  );
  const nameOf = (id: number) => (bases.data ?? []).find(b => Number(b.id) === id)?.name ?? `Base ${id}`;
  return rosterOverlap({ instructorId, weekly: w, exceptions: e, fromDate: today, baseName: nameOf });
}

export async function GET() {
  const { error } = await requireRole(ROSTER_VIEW_ROLES);
  if (error) return error;

  const [weekly, exceptions] = await Promise.all([
    supabaseAdmin.from('instructor_roster').select('instructor_id, base_id, weekday, start_time, end_time, updated_by, updated_at'),
    supabaseAdmin.from('instructor_roster_exceptions').select('id, instructor_id, base_id, date, start_time, end_time, note, created_by').order('date'),
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
  const baseId = await writeBase(body?.baseId);
  if (baseId === null) return NextResponse.json({ error: 'Pick an active base.' }, { status: 400 });

  const proposed: WeeklyRow[] = days.map((d: { weekday: number; startTime?: string | null; endTime?: string | null }) => ({
    instructorId, baseId, weekday: d.weekday, startTime: d.startTime ?? null, endTime: d.endTime ?? null,
  }));
  const overlap = await overlapAfter(instructorId, (w, e) => [[...w.filter(r => rowBase(r) !== baseId), ...proposed], e]);
  if (overlap) return NextResponse.json({ error: overlap }, { status: 409 });

  const updatedBy = session.user.name || session.user.email || '';
  const { error: dbError } = await supabaseAdmin.from('instructor_roster').upsert(
    proposed.map(d => ({
      instructor_id: instructorId, base_id: baseId, weekday: d.weekday,
      start_time: d.startTime, end_time: d.endTime,
      updated_by: updatedBy, updated_at: new Date().toISOString(),
    })),
    { onConflict: 'instructor_id,base_id,weekday' },
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
  const baseId = await writeBase(body?.baseId);
  if (baseId === null) return NextResponse.json({ error: 'Pick an active base.' }, { status: 400 });

  const overlap = await overlapAfter(instructorId, (w, e) => [w, [
    ...e.filter(r => !(rowBase(r) === baseId && r.date === date)),
    { instructorId, baseId, date, startTime, endTime },
  ]]);
  if (overlap) return NextResponse.json({ error: overlap }, { status: 409 });

  const { error: dbError } = await supabaseAdmin.from('instructor_roster_exceptions').upsert({
    instructor_id: instructorId, base_id: baseId, date, start_time: startTime, end_time: endTime,
    note: typeof body?.note === 'string' ? body.note.slice(0, 200) : '',
    created_by: session.user.name || session.user.email || '',
  }, { onConflict: 'instructor_id,base_id,date' });
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
  const baseId = Number(url.searchParams.get('baseId') || 1);
  if (!instructorId || !DATE.test(date) || !Number.isInteger(baseId) || baseId < 1) {
    return NextResponse.json({ error: 'instructorId and date (YYYY-MM-DD) are required.' }, { status: 400 });
  }
  // Removing a change brings the weekly hours back that day, which can overlap another base.
  const overlap = await overlapAfter(instructorId, (w, e) => [w, e.filter(r => !(rowBase(r) === baseId && r.date === date))]);
  if (overlap) return NextResponse.json({ error: `${overlap} Change the other base first.` }, { status: 409 });

  const { data, error: dbError } = await supabaseAdmin.from('instructor_roster_exceptions')
    .delete().eq('instructor_id', instructorId).eq('base_id', baseId).eq('date', date).select('id');
  if (dbError) {
    console.error('Error removing roster exception:', dbError);
    return NextResponse.json({ error: 'Failed to remove the change for that day.' }, { status: 500 });
  }
  if (!data?.length) return NextResponse.json({ error: 'No change found for that day.' }, { status: 404 });
  return NextResponse.json({ success: true });
}
