// app/api/staff/route.ts
// Staff master (B2; claude/staff-master-design-2026-09-24.md). Admin + super
// admin only (STAFF_ROLES). GET lists every staff record with what it's linked
// to (login role / instructor profile / AME) and its ID documents MASKED.
// POST creates one; the database issues the staff ID (regular, or SUB for a
// contract AME). ID documents are encrypted before they reach the database,
// and entering them is logged as ADD in staff_document_views.
// Full ID documents: GET /api/staff/[id] only.

import { NextResponse } from 'next/server';
import { requireRole, STAFF_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parseStaffBody, toStaffMember, staffDbError, logDocumentAction, STAFF_SELECT } from '@/lib/staff-server';

export async function GET() {
  const { error } = await requireRole(STAFF_ROLES);
  if (error) return error;

  const { data, error: dbError } = await supabaseAdmin.from('staff_members').select(STAFF_SELECT).order('staff_id');
  if (dbError) {
    console.error('Error loading staff:', dbError);
    return NextResponse.json({ error: 'Failed to load staff.' }, { status: 500 });
  }
  return NextResponse.json({ staff: (data ?? []).map(r => toStaffMember(r as Record<string, unknown>)) });
}

export async function POST(request: Request) {
  const { session, error } = await requireRole(STAFF_ROLES);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseStaffBody(body, true);
  } catch (e) {
    console.error('Error encrypting ID documents:', (e as Error).message); // never log the values
    return NextResponse.json({ error: 'ID documents could not be encrypted. Check STAFF_DATA_KEY on the server.' }, { status: 500 });
  }
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error: dbError } = await supabaseAdmin.from('staff_members').insert(parsed.data).select(STAFF_SELECT).single();
  if (dbError) {
    console.error('Error creating staff record:', dbError.code, dbError.message);
    return NextResponse.json({ error: staffDbError(dbError, 'Failed to save the staff record.') }, { status: 400 });
  }
  if (parsed.data.id_documents_enc && !(await logDocumentAction((data as Record<string, unknown>).id as number, session.user, 'ADD'))) {
    return NextResponse.json({ error: 'Saved, but the ID documents could not be written to the ID-document log. Tell your super admin.' }, { status: 500 });
  }
  return NextResponse.json({ staff: toStaffMember(data as Record<string, unknown>) });
}
