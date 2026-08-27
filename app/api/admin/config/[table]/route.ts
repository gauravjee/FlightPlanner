// app/api/admin/config/[table]/route.ts
// ---------------------------------------------------------------------------
// Server-side, role-scoped CRUD for the Admin Setup wizard's config tabs.
//
// Why this exists (2026-08-21 security hardening round): the whole-frontend
// review found that most of the Admin Setup wizard's tabs — Exercises,
// Training Programs, Instructor Roles, Sortie Types, Ground School Subjects,
// Requirement Templates, and the Holiday Calendar — wrote straight from the
// browser to Supabase using the public anon key, with only a client-side
// `RoleGate allowedRoles={['super_admin']}` on the wizard page itself
// guarding access. Since this app's RLS policies are permissive
// (`USING (true)`) on most tables, that check was effectively decorative —
// anyone who could reach the anon key could write to any of these tables
// directly, bypassing the UI entirely. This is the same class of gap
// already fixed for the Requirements Checklist toggle (see
// app/api/admin/requirements/toggle/route.ts) and for Aircraft (see
// app/api/aircraft/route.ts) — this route closes it for the remaining six
// config tables in one place instead of one bespoke route per table.
//
// ONE shared route instead of six near-identical ones: every one of these
// tables is a simple "add/edit/delete a config row, gated to the same
// role" shape, differing only in table name and column list. A single
// whitelisted route is easier to keep correct than six copies that could
// individually drift. Safety comes from the whitelist below, not from the
// URL segment — `table` selects a resource, but only that resource's
// pre-approved columns can ever be written, regardless of what a modified
// or direct client sends in the body.
//
// Reads stay as direct client-side Supabase calls, unchanged — same scope
// convention as every other route in this app (see app/api/aircraft/
// route.ts's own header comment). This route only covers the write path.
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server';
import { requireRole, ADMIN_SETUP_WRITE_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Maps the URL's `table` segment to { the real Postgres table, the columns
// this route is allowed to write }. Adding a new Admin Setup config tab
// later means adding one entry here, not a new route file.
const TABLES: Record<string, { dbTable: string; columns: string[] }> = {
  exercises: {
    dbTable: 'exercises',
    columns: ['exercise_name', 'short_code', 'full_description', 'is_active', 'sort_order'],
  },
  'training-programs': {
    dbTable: 'training_programs',
    columns: [
      'program_name', 'program_code', 'required_hours',
      'solo_hours', 'cross_country_hours', 'instrument_hours', 'night_hours', 'landings_required',
      'multi_engine_hours', 'simulator_hours', 'description', 'is_active', 'sort_order',
    ],
  },
  'instructor-roles': {
    dbTable: 'instructor_roles',
    columns: ['role_name', 'role_code', 'description', 'is_active'],
  },
  'sortie-types': {
    dbTable: 'sortie_types',
    columns: ['type_name', 'type_code', 'color_hex', 'requires_instructor', 'requires_student', 'is_active'],
  },
  'ground-school-subjects': {
    dbTable: 'ground_school_subjects',
    columns: [
      'subject_name', 'subject_code', 'validity_years', 'required_before_hours',
      'is_mandatory', 'sort_order', 'is_active',
    ],
  },
  'requirement-templates': {
    dbTable: 'training_requirement_templates',
    columns: [
      'requirement_name', 'requirement_category', 'program_code', 'sort_order',
      'validity_years', 'required_before_hours', 'blocks_solo', 'blocks_all_flights', 'notes',
    ],
  },
  // Holiday Calendar (Admin Setup) — lib/store.ts's addHoliday/
  // addHolidaysBulk/removeHoliday now call this instead of writing to
  // Supabase directly. The conflict-count check (countScheduleConflictsOnDate)
  // stays a client-side read — no security concern, it never writes.
  holidays: {
    dbTable: 'holidays',
    columns: ['holiday_name', 'holiday_date', 'is_recurring', 'notes'],
  },
  // Aircraft Maintenance Schedule (Admin Setup, 2026-08-26, Phase 1) —
  // recurring maintenance items per aircraft model. See
  // add-aircraft-maintenance-schedule.sql for the schema/seed data and
  // AircraftMaintenanceScheduleTab.tsx for the CRUD UI.
  'aircraft-maintenance-schedule': {
    dbTable: 'aircraft_maintenance_schedule_templates',
    columns: ['aircraft_model', 'item_name', 'interval_type', 'interval_value', 'notes', 'is_active'],
  },
};

function pickAllowed(body: Record<string, unknown>, columns: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of columns) {
    if (body[col] !== undefined) out[col] = body[col];
  }
  return out;
}

type RouteContext = { params: Promise<{ table: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { error } = await requireRole(ADMIN_SETUP_WRITE_ROLES);
  if (error) return error;

  const { table } = await context.params;
  const config = TABLES[table];
  if (!config) {
    return NextResponse.json({ error: 'Unknown config resource.' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // Bulk insert (e.g. the Exercises tab's CSV import, or Holiday Calendar's
  // recurring-holiday bulk add) — body is an array of row objects.
  if (Array.isArray(body)) {
    const rows = body.map((row) => pickAllowed(row as Record<string, unknown>, config.columns));
    const { data, error: dbError } = await supabaseAdmin.from(config.dbTable).insert(rows).select();
    if (dbError) {
      console.error(`Error bulk-inserting into ${config.dbTable}:`, dbError);
      return NextResponse.json({ error: 'Failed to import rows.' }, { status: 500 });
    }
    return NextResponse.json({ rows: data });
  }

  const insertBody = pickAllowed(body as Record<string, unknown>, config.columns);
  const { data, error: dbError } = await supabaseAdmin
    .from(config.dbTable)
    .insert(insertBody)
    .select()
    .maybeSingle();

  if (dbError) {
    console.error(`Error inserting into ${config.dbTable}:`, dbError);
    return NextResponse.json({ error: 'Failed to save.' }, { status: 500 });
  }

  return NextResponse.json({ row: data });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { error } = await requireRole(ADMIN_SETUP_WRITE_ROLES);
  if (error) return error;

  const { table } = await context.params;
  const config = TABLES[table];
  if (!config) {
    return NextResponse.json({ error: 'Unknown config resource.' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const id = body.id as string | number | undefined;
  if (id === undefined || id === null) {
    return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  }

  const updates = pickAllowed(body, config.columns);
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  const { data, error: dbError } = await supabaseAdmin
    .from(config.dbTable)
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (dbError) {
    console.error(`Error updating ${config.dbTable}:`, dbError);
    return NextResponse.json({ error: 'Failed to save.' }, { status: 500 });
  }

  return NextResponse.json({ row: data });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { error } = await requireRole(ADMIN_SETUP_WRITE_ROLES);
  if (error) return error;

  const { table } = await context.params;
  const config = TABLES[table];
  if (!config) {
    return NextResponse.json({ error: 'Unknown config resource.' }, { status: 404 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  }

  const { error: dbError } = await supabaseAdmin.from(config.dbTable).delete().eq('id', id);

  if (dbError) {
    console.error(`Error deleting from ${config.dbTable}:`, dbError);
    return NextResponse.json({ error: 'Failed to delete.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
