// app/api/staff/[id]/route.ts
// GET: one staff member's FULL ID documents (PAN, Aadhaar, passport),
// decrypted — admin + super admin only, and every call is logged in
// staff_document_views (who, whose, when). PATCH: update a staff record;
// idDocuments, when sent, replaces the whole encrypted set. The staff ID and
// the SUB/regular choice can never change (database trigger).

import { NextResponse } from 'next/server';
import { requireRole, STAFF_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { decryptIdDocuments } from '@/lib/staff-crypto';
import { parseStaffBody, toStaffMember, staffDbError, STAFF_SELECT } from '@/lib/staff-server';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { session, error } = await requireRole(STAFF_ROLES);
  if (error) return error;
  const { id } = await context.params;

  const { data: viewer } = await supabaseAdmin.from('users').select('id').eq('email', session.user.email!).maybeSingle();
  if (!viewer) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });

  const { data, error: dbError } = await supabaseAdmin.from('staff_members').select('id_documents_enc').eq('id', id).maybeSingle();
  if (dbError) {
    console.error('Error loading ID documents:', dbError.code);
    return NextResponse.json({ error: 'Failed to load ID documents.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });

  // Log first: no log row, no documents.
  const { error: logError } = await supabaseAdmin.from('staff_document_views').insert({ staff_member_id: id, viewed_by: viewer.id });
  if (logError) {
    console.error('Error logging ID document view:', logError.code);
    return NextResponse.json({ error: 'Failed to load ID documents.' }, { status: 500 });
  }

  try {
    return NextResponse.json({ idDocuments: data.id_documents_enc ? decryptIdDocuments(data.id_documents_enc as string) : {} });
  } catch (e) {
    console.error('Error decrypting ID documents:', (e as Error).message);
    return NextResponse.json({ error: 'ID documents could not be decrypted. Check STAFF_DATA_KEY on the server.' }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { error } = await requireRole(STAFF_ROLES);
  if (error) return error;
  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseStaffBody(body, false);
  } catch (e) {
    console.error('Error encrypting ID documents:', (e as Error).message);
    return NextResponse.json({ error: 'ID documents could not be encrypted. Check STAFF_DATA_KEY on the server.' }, { status: 500 });
  }
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (Object.keys(parsed.data).length === 0) return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });

  const { data, error: dbError } = await supabaseAdmin.from('staff_members').update(parsed.data).eq('id', id).select(STAFF_SELECT).maybeSingle();
  if (dbError) {
    console.error('Error updating staff record:', dbError.code, dbError.message);
    return NextResponse.json({ error: staffDbError(dbError, 'Failed to save the staff record.') }, { status: 400 });
  }
  if (!data) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
  return NextResponse.json({ staff: toStaffMember(data as Record<string, unknown>) });
}
