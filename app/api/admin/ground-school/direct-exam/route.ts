// app/api/admin/ground-school/direct-exam/route.ts
// ---------------------------------------------------------------------------
// POST { studentId, subjectId, subjectName, rollNumber, score }
//
// Server-side, role-scoped "Direct Exam Entry" — records a student's
// already-passed DGCA exam (roll number + real score) as an EXEMPTED
// ground_school_enrollment row, then syncs the matching Requirements
// Checklist item, in one atomic server action.
//
// Why this exists (2026-08-21 security hardening round): the whole-frontend
// review flagged this specifically — app/dashboard/ground-school/progress/
// page.tsx's addDirectExam() used to insert straight into
// ground_school_enrollment from the browser with the anon key and NO role
// check at all. Combined with that same page's IDOR (?student= URL param
// overriding the session-derived student with no ownership check, fixed
// separately in the page itself), this meant literally any logged-in user
// could set an arbitrary PASS/EXEMPTED result, score, and DGCA roll number
// for any student. This route closes that: only REQUIREMENTS_WRITE_ROLES
// (admin/instructor/super_admin — same roles already allowed to toggle a
// Requirements Checklist item) may call it, enforced server-side via
// requireRole, not just hidden in the UI.
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server';
import { requireRole, REQUIREMENTS_WRITE_ROLES } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { todayIST } from '@/lib/ist';
import { DGCA_PASS_MARK, deriveExamResult, isValidExamScore } from '@/lib/dgca';

export async function POST(request: Request) {
  const { session, error } = await requireRole(REQUIREMENTS_WRITE_ROLES);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const studentId = typeof body.studentId === 'string' ? body.studentId : undefined;
  const subjectName = typeof body.subjectName === 'string' ? body.subjectName : undefined;
  const rollNumber = typeof body.rollNumber === 'string' ? body.rollNumber.trim() : '';
  const score = typeof body.score === 'number' ? body.score : NaN;

  if (!studentId || !subjectName) {
    return NextResponse.json({ error: 'studentId and subjectName are required.' }, { status: 400 });
  }
  if (!rollNumber) {
    return NextResponse.json({ error: 'DGCA roll number is required to record a pass.' }, { status: 400 });
  }
  if (!isValidExamScore(score)) {
    return NextResponse.json({ error: 'Enter a valid exam score (0–100).' }, { status: 400 });
  }

  // 2026-09-18: this route records an ALREADY-PASSED DGCA exam, and a DGCA
  // pass is 70% (lib/dgca.ts). Before this check it inserted
  // `exam_result: 'PASS'` unconditionally — a score of 40 typed into the
  // Direct Exam Entry form was stored as an EXEMPTED PASS and completed the
  // student's Requirements Checklist item. There is no failing-entry flow on
  // this screen (it exists for pre-existing qualifications), so a sub-pass
  // score is rejected rather than silently recorded as something else.
  if (deriveExamResult(score) !== 'PASS') {
    return NextResponse.json(
      { error: `A DGCA pass requires at least ${DGCA_PASS_MARK}%. Record a re-sit through the class attendance screen instead.` },
      { status: 400 },
    );
  }

  // 1. Create the EXEMPTED enrollment record — same shape the client used
  // to insert directly, just done here with the service-role key instead
  // of the anon key.
  const { error: insertError } = await supabaseAdmin.from('ground_school_enrollment').insert([
    {
      class_id: null,
      student_id: studentId,
      attendance_status: 'EXEMPTED',
      exam_score: score,
      exam_result: 'PASS',
      exam_date: todayIST(),
      attempts: 1,
      examiner: 'Direct Exam Entry',
      dgca_roll_number: rollNumber,
      notes: `Requirements Checklist: ${subjectName}`,
    },
  ]);

  if (insertError) {
    console.error('Error recording direct exam entry:', insertError);
    return NextResponse.json({ error: 'Failed to record exam.' }, { status: 500 });
  }

  // 2. Sync the matching Requirements Checklist item(s) — mirrors
  // lib/ground-school-sync.ts's syncRequirementsFromGroundSchoolPass, but
  // done here with supabaseAdmin so the whole action is one authoritative
  // server-side write instead of a client-side follow-up call.
  const { data: matchingReqs, error: reqLookupError } = await supabaseAdmin
    .from('training_requirements')
    .select('id, requirement_name, is_completed')
    .eq('student_id', studentId);

  if (reqLookupError) {
    console.error('Error looking up requirements to sync:', reqLookupError);
    // The enrollment record itself already saved — don't fail the whole
    // request over the sync step, but report it so the client can surface
    // a partial-success message instead of claiming full success.
    return NextResponse.json({ success: true, synced: 0, syncError: true });
  }

  const toSync = (matchingReqs || []).filter(
    (r) => !r.is_completed && (r.requirement_name as string).includes(subjectName)
  );

  // Same completedBy convention as app/api/admin/requirements/toggle/
  // route.ts — always the verified signed-in user, never a hardcoded
  // placeholder string.
  const completedBy = session.user.name || session.user.email || 'Unknown';

  let synced = 0;
  for (const req of toSync) {
    const { error: updateError } = await supabaseAdmin
      .from('training_requirements')
      .update({
        is_completed: true,
        completed_date: todayIST(),
        completed_by: completedBy,
      })
      .eq('id', req.id);
    if (!updateError) synced += 1;
  }

  return NextResponse.json({ success: true, synced });
}
