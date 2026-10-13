// app/api/students/[id]/route.ts
// Staff-only update/delete for a single student record.
//
// Column updates are whitelisted here (rather than trusting whatever keys
// the client sends) so this endpoint can't be used to write to arbitrary
// columns even if a future caller sends an unexpected field.
//
// FIX (2026-08-17, per-user permission override round): PATCH/DELETE here
// were still gated to the broader STUDENT_STAFF_ROLES (which includes
// operations) instead of the narrower STUDENT_WRITE_ROLES the 2026-08-17
// role/tab matrix introduced to make operations view-only for Students —
// this route was missed when that matrix patch touched every OTHER write
// route. StudentCard.tsx's Edit/Remove buttons were correctly hidden from
// operations client-side, but operations could still have called this API
// directly and it would have gone through. Now uses requireModuleAccess,
// which is STUDENT_WRITE_ROLES-equivalent by default and additionally
// honors a super_admin-granted per-user override for operations/
// instructor/maintenance users (see lib/permissions.ts).
import { NextResponse } from 'next/server';
import { requireModuleAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parseStudentDocs, logStudentDocumentAction, BLOOD_GROUPS, STUDENT_ADMIN_ROLES } from '@/lib/student-server';

type RouteContext = { params: Promise<{ id: string }> };

// camelCase (client) -> snake_case (db column) for every field the app is
// allowed to update on a student record.
// B3/B4 (13 Oct): trainingStage and status are no longer set here. The course
// changes through /courses (course history) and status through /status (its rules).
const FIELD_MAP: Record<string, string> = {
  name: 'name',
  initials: 'initials',
  totalHours: 'total_hours',
  medicalExpiry: 'medical_expiry',
  email: 'email',
  phone: 'phone',
  dateOfBirth: 'date_of_birth',
  joinedDate: 'joined_date',
  firstSoloDate: 'first_solo_date',
  assignedInstructorId: 'assigned_instructor_id',
  splNumber: 'spl_number',
  splExpiryDate: 'spl_expiry_date',
  splIssueDate: 'spl_issue_date',
  // Medical (DGCA Class 1) issue date (2026-08-25), paired with
  // medicalExpiry above. See add-medical-issue-date.sql.
  medicalIssueDate: 'medical_issue_date',
  address: 'address',
  nationality: 'nationality',
  emergencyContactName: 'emergency_contact_name',
  emergencyContactRelation: 'emergency_contact_relation',
  emergencyContactPhone: 'emergency_contact_phone',
  bloodGroup: 'blood_group',
};

export async function PATCH(request: Request, context: RouteContext) {
  const { session, error } = await requireModuleAccess('students', 'full');
  if (error) return error;

  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const dbUpdates: Record<string, unknown> = {};
  for (const [clientKey, dbKey] of Object.entries(FIELD_MAP)) {
    if (body[clientKey] !== undefined) {
      // assignedInstructorId can legitimately be cleared to null.
      dbUpdates[dbKey] = clientKey === 'assignedInstructorId'
        ? (body[clientKey] ? String(body[clientKey]) : null)
        : body[clientKey];
    }
  }

  // date_of_birth, medical_expiry, medical_issue_date, spl_expiry_date,
  // and spl_issue_date are all `date` columns — Postgres rejects '' as an
  // invalid date literal, unlike a text column (e.g. spl_number), which
  // tolerates it. Clearing any of these dates in the form sends '', which
  // needs to become null here rather than being passed straight through.
  // (2026-08-25: extended to date_of_birth/medical_expiry/
  // medical_issue_date — date_of_birth in particular was previously never
  // actually editable via the UI, so this gap never surfaced; now that a
  // Date of Birth field exists, an untouched/cleared field would hit it.)
  for (const dateCol of ['date_of_birth', 'medical_expiry', 'medical_issue_date', 'spl_expiry_date', 'spl_issue_date', 'joined_date']) {
    if (dbUpdates[dateCol] === '') {
      dbUpdates[dateCol] = null;
    }
  }
  for (const textCol of ['address', 'nationality', 'emergency_contact_name', 'emergency_contact_relation', 'emergency_contact_phone', 'blood_group']) {
    if (typeof dbUpdates[textCol] === 'string') dbUpdates[textCol] = (dbUpdates[textCol] as string).trim() || null;
  }
  if (dbUpdates.blood_group && !BLOOD_GROUPS.includes(dbUpdates.blood_group as string)) {
    return NextResponse.json({ error: 'Blood group must be one of ' + BLOOD_GROUPS.join(', ') + '.' }, { status: 400 });
  }

  // B3: ID documents (Aadhaar + passport), admin / super admin only; replaces the whole set, logged as EDIT.
  if (body.idDocuments !== undefined) {
    if (!STUDENT_ADMIN_ROLES.includes(session.user.role ?? '')) {
      return NextResponse.json({ error: 'Only an admin can change ID documents.' }, { status: 403 });
    }
    try {
      const docs = parseStudentDocs(body.idDocuments);
      if (docs.error) return NextResponse.json({ error: docs.error }, { status: 400 });
      dbUpdates.id_documents_enc = docs.enc;
    } catch (e) {
      console.error('Error encrypting student ID documents:', (e as Error).message);
      return NextResponse.json({ error: 'ID documents could not be encrypted. Check STAFF_DATA_KEY on the server.' }, { status: 500 });
    }
  }

  if (Object.keys(dbUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  const { data: rows, error: dbError } = await supabaseAdmin
    .from('students')
    .update(dbUpdates)
    .eq('id', id).select('id');

  if (dbError) {
    console.error('Error updating student:', dbError);
    return NextResponse.json({ error: 'Failed to update student.' }, { status: 500 });
  }

  if (!rows?.length) {
    return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  }
  // shortcut: logged after the save (same as staff), so a failed log leaves a change without a row.
  if ('id_documents_enc' in dbUpdates && !(await logStudentDocumentAction(id, session.user, 'EDIT'))) {
    return NextResponse.json({ error: 'Saved, but the change could not be written to the ID-document log. Tell your super admin.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { error } = await requireModuleAccess('students', 'full');
  if (error) return error;

  const { id } = await context.params;

  // Unlink and deactivate any login tied to this profile FIRST, before
  // touching the students row. users.student_id has a foreign key back to
  // students.id, so deleting the student while a users row still
  // references it fails with a 23503 foreign-key-violation ("students" is
  // still referenced from table "users") — that's the bug this reordering
  // fixes. Clearing student_id is what actually satisfies the constraint;
  // is_active=false on top of that makes sure the login can't be used
  // again even though its link to a training profile is now gone.
  // Remember the login(s) first so a refused delete can put them back
  // exactly as they were (fk-design-2026-10-08).
  const { data: linked } = await supabaseAdmin.from('users').select('id, is_active').eq('student_id', id);
  const { error: userDeactivateError } = await supabaseAdmin
    .from('users')
    .update({ is_active: false, student_id: null })
    .eq('student_id', id);

  if (userDeactivateError) {
    console.error('Error deactivating student login before profile delete:', userDeactivateError);
    return NextResponse.json({ error: 'Failed to delete student.' }, { status: 500 });
  }

  const { data: rows, error: dbError } = await supabaseAdmin
    .from('students')
    .delete()
    .eq('id', id).select('id');

  if (dbError) {
    // The delete failed, so put the login(s) back exactly as they were.
    for (const u of linked ?? []) {
      await supabaseAdmin.from('users').update({ student_id: id, is_active: u.is_active }).eq('id', u.id);
    }
    // FK (fk-design-2026-10-08): history still points here, so the database refuses the delete.
    if (dbError.code === '23503') {
      return NextResponse.json({ error: "This student has flights or training records, so they can't be deleted. Change their status instead." }, { status: 409 });
    }
    console.error('Error deleting student:', dbError);
    return NextResponse.json({ error: 'Failed to delete student.' }, { status: 500 });
  }

  if (!rows?.length) {
    return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
