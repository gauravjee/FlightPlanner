// app/api/students/[id]/documents/route.ts
// GET: one student's FULL ID documents (Aadhaar, passport), decrypted. Admin and
// super admin only; every call is logged in student_document_views as VIEW. Changing
// them goes through PATCH /api/students/[id] with idDocuments (logged as EDIT).

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { decryptIdDocuments } from '@/lib/staff-crypto';
import { logStudentDocumentAction, STUDENT_ADMIN_ROLES } from '@/lib/student-server';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { session, error } = await requireRole(STUDENT_ADMIN_ROLES);
  if (error) return error;
  const { id } = await context.params;

  const { data, error: dbError } = await supabaseAdmin.from('students').select('id_documents_enc').eq('id', id).maybeSingle();
  if (dbError && dbError.code !== '22P02') {
    console.error('Error loading student ID documents:', dbError.code);
    return NextResponse.json({ error: 'Failed to load ID documents.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Student not found.' }, { status: 404 });

  // Log first: no log row, no documents.
  if (!(await logStudentDocumentAction(id, session.user, 'VIEW'))) {
    return NextResponse.json({ error: 'Failed to load ID documents.' }, { status: 500 });
  }
  try {
    return NextResponse.json({ idDocuments: data.id_documents_enc ? decryptIdDocuments(data.id_documents_enc as string) : {} });
  } catch (e) {
    console.error('Error decrypting student ID documents:', (e as Error).message);
    return NextResponse.json({ error: 'ID documents could not be decrypted. Check STAFF_DATA_KEY on the server.' }, { status: 500 });
  }
}
