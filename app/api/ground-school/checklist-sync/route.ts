// app/api/ground-school/checklist-sync/route.ts
// ---------------------------------------------------------------------------
// Server-side, role-scoped counterpart to lib/ground-school-sync.ts's
// syncGroundSchoolFromChecklist() — the second half of the item-39 cleanup
// (see app/api/ground-school/enrollment/route.ts for the first half and the
// full background).
//
// WHAT THIS IS. Ticking a subject on the Requirements Checklist records an
// EXEMPTED `ground_school_enrollment` row as the ground-school-side marker of
// that pass; un-ticking it removes that same row. Both writes used to happen
// in the browser with the anon key and no role check of any kind.
//
// ⚠️ THE CHECKLIST TOGGLE ITSELF WAS NEVER THE HOLE. `RequirementsChecklist`
// already writes `training_requirements` through the gated
// app/api/admin/requirements/toggle route, and syncRequirementsFromGround-
// SchoolPass() goes through that same route. The 2026-09-11 review report
// listed both tables as exposed; on reading the code, only this one write
// path actually was — one layer below the component the report named.
//
// ROLE SET. REQUIREMENTS_WRITE_ROLES (admin/instructor/super_admin), matching
// the checklist UI this is reached from and the direct-exam route that writes
// a near-identical row. Deliberately NOT the wider GROUND_SCHOOL_WRITE_ROLES
// the attendance route uses: `operations` can mark attendance but has never
// been offered the Requirements Checklist, and this route exists to enforce
// the status quo, not to quietly widen it.
//
// The delete is keyed on (student_id, EXEMPTED, notes) rather than on a row
// id because the caller genuinely does not know the id — it is removing "the
// marker this checklist item created", which is identified by its provenance
// string. Preserved from the original client-side implementation on purpose;
// changing that key would orphan every row already written under it.
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server';
import { requireRole, REQUIREMENTS_WRITE_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { todayIST } from '@/lib/ist';

export async function POST(request: Request) {
  const { error } = await requireRole(REQUIREMENTS_WRITE_ROLES);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const studentId = typeof body.studentId === 'string' ? body.studentId : undefined;
  const subjectName = typeof body.subjectName === 'string' ? body.subjectName : undefined;
  const completed = body.completed === true;
  const examScore = typeof body.examScore === 'number' ? body.examScore : undefined;
  const rollNumber = typeof body.rollNumber === 'string' ? body.rollNumber : undefined;

  if (!studentId || !subjectName) {
    return NextResponse.json({ error: 'studentId and subjectName are required.' }, { status: 400 });
  }

  // The provenance string that identifies rows this flow owns. Must stay
  // byte-identical to what the client used to write, or un-ticking an item
  // recorded before this change would silently fail to find its row.
  const provenance = `Requirements Checklist: ${subjectName}`;

  if (!completed) {
    // .select('id') so the caller can tell "removed a row" from "there was
    // nothing to remove" — Supabase returns success either way. A session on
    // 2026-09-16 deleted a real pre-existing marker because the response gave
    // it no way to see that distinction.
    const { data: deleted, error: deleteError } = await supabaseAdmin
      .from('ground_school_enrollment')
      .delete()
      .eq('student_id', studentId)
      .eq('attendance_status', 'EXEMPTED')
      .eq('notes', provenance)
      .select('id');

    if (deleteError) {
      console.error('Error removing EXEMPTED ground school record:', deleteError);
      return NextResponse.json({ error: 'Failed to remove the ground school record.' }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      action: deleted && deleted.length > 0 ? 'deleted' : 'absent',
    });
  }

  // Idempotent by design: the checklist can be re-ticked, and a second
  // EXEMPTED row for the same subject would double-count the student's
  // ground school progress.
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from('ground_school_enrollment')
    .select('id')
    .eq('student_id', studentId)
    .eq('attendance_status', 'EXEMPTED')
    .eq('notes', provenance);

  if (lookupError) {
    console.error('Error checking for an existing EXEMPTED record:', lookupError);
    return NextResponse.json({ error: 'Failed to check the existing ground school record.' }, { status: 500 });
  }

  if (existing && existing.length > 0) {
    return NextResponse.json({ success: true, action: 'unchanged' });
  }

  const { error: insertError } = await supabaseAdmin.from('ground_school_enrollment').insert([
    {
      class_id: null,
      student_id: studentId,
      attendance_status: 'EXEMPTED',
      exam_score: examScore ?? 100,
      exam_result: 'PASS',
      exam_date: todayIST(),
      attempts: 1,
      examiner: 'Requirements Checklist',
      dgca_roll_number: rollNumber ?? null,
      notes: provenance,
    },
  ]);

  if (insertError) {
    console.error('Error creating EXEMPTED ground school record:', insertError);
    return NextResponse.json({ error: 'Failed to create the ground school record.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, action: 'created' });
}
