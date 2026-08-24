// app/dashboard/ground-school/progress/page.tsx
// ---------------------------------------------------------------------------
// Student Ground School Progress View
// ---------------------------------------------------------------------------
// Purpose:
//   - Display a detailed breakdown of a student's ground school performance.
//   - Show overall progress per subject (attendance + exam results).
//   - List all enrolled classes with attendance and exam details.
//   - Allow admins/instructors to mark subjects as "previously completed"
//     (for students who already passed DGCA exams before joining).
//
// Access:
//   - Admins & Instructors: can select any student from a dropdown.
//   - Students: automatically see their own progress (ID from session).
//   - URL param "?student=UUID" pre‑selects a student (used by the
//     Flight Progress page to link directly).
//
// Data sources:
//   - `students` table (for name / initials)
//   - `ground_school_subjects` (list of subjects)
//   - `ground_school_classes` + `ground_school_enrollment` (class & exam data)
//
// Special handling:
//   - Subjects marked as EXEMPTED (attendance_status) are treated as
//     previously completed — they show a green badge and skip attendance
//     tracking.
//   - When navigated from /dashboard/progress, the ?student= parameter
//     auto‑selects the correct student.
// ---------------------------------------------------------------------------

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation'; // ← For reading ?student= param
import { supabase } from '@/lib/supabase-client';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { ArrowLeft, GraduationCap, ClipboardList, CircleCheck, X } from 'lucide-react';
import { useEscapeToClose } from '@/lib/useEscapeToClose';

// ============================================================
// Type definitions
// ============================================================
interface Subject {
  id: number;
  subject_name: string;
  subject_code: string;
}

interface Student {
  id: string;          // UUID (student_id in enrollment table)
  name: string;
  initials: string;
}

interface ClassInfo {
  id: number;
  class_date: string;
  start_time: string;
  end_time: string;
  subject_name: string;
  instructor_initials: string;
}

interface EnrollmentRecord {
  id: number;
  class_id: number | null;      // null for exempted entries (no actual class)
  student_id: string;
  attendance_status: string;    // PENDING, PRESENT, ABSENT, EXCUSED, EXEMPTED
  exam_score: number | null;
  exam_result: string | null;   // PASS, FAIL
  exam_date: string | null;
  attempts: number;
  examiner: string;
  notes: string;
  // 2026-08-19: these subjects (Air Regulations, Air Navigation, etc.) are
  // externally examined by DGCA — the FTO only delivers the coaching/
  // classes, not the exam itself. This ties a recorded pass back to the
  // real DGCA exam record. See add-dgca-roll-number-to-ground-school.sql.
  dgca_roll_number: string | null;
  // Enriched fields (joined client‑side from classes array)
  class_date?: string;
  start_time?: string;
  end_time?: string;
  subject_name?: string;
  instructor_initials?: string;
}

// ============================================================
// Component
// ============================================================
export default function StudentProgressPage() {
  // ----- Session (for student role auto‑select) -----
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role;
  const userStudentId = (session?.user as any)?.studentId;

  // ----- URL params (for pre‑selecting student from Progress page) -----
  // When a user clicks the "Ground School Progress" link on /dashboard/progress,
  // the URL will be /dashboard/ground-school/progress?student=UUID
  const searchParams = useSearchParams();
  const studentParam = searchParams.get('student');

  // ----- State -----
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentRecord[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState('');

  // 2026-08-19: Direct Exam Entry used to fire immediately on a confirm()
  // dialog with hardcoded exam_score=100/exam_result=PASS — no real DGCA
  // exam data was ever collected. This now opens a small form instead,
  // which sets these two fields (subjectId/subjectName identify which
  // subject the open modal is for; null = closed).
  const [directExamModal, setDirectExamModal] = useState<{ subjectId: number; subjectName: string } | null>(null);

  // 2026-08-21 (accessibility round) — see lib/useEscapeToClose.ts.
  useEscapeToClose(() => {
    if (directExamModal) setDirectExamModal(null);
  });
  const [directExamRollNumber, setDirectExamRollNumber] = useState('');
  const [directExamScore, setDirectExamScore] = useState('');
  const [directExamError, setDirectExamError] = useState('');

  // ============================================================
  // Load static data (subjects, students, classes)
  // These are loaded once and used to enrich enrollment records.
  // ============================================================
  const loadStaticData = useCallback(async () => {
    // Fetch all three data sources in parallel for performance. Students
    // come from the role-scoped /api/students route (not a direct
    // Supabase call — see app/api/students/route.ts): staff get the full
    // active roster for the picker below, a 'student'-role caller only
    // ever gets their own record (which this page doesn't use — students
    // never see the picker, their ID comes from the session instead).
    const [subRes, stuRes, clsRes] = await Promise.all([
      supabase
        .from('ground_school_subjects')
        .select('*')
        .eq('is_active', true)
        .order('sort_order'),
      fetch('/api/students').then(
        (r): Promise<{ students: { id: string; name: string; initials: string; status: string }[] }> =>
          r.ok ? r.json() : Promise.resolve({ students: [] })
      ),
      supabase
        .from('ground_school_classes')
        .select(
          'id, class_date, start_time, end_time, subject_id, instructor_id, ground_school_subjects(subject_name), instructors(initials)'
        )
        .order('class_date', { ascending: false }),
    ]);

    setSubjects(subRes.data || []);
    setStudents((stuRes.students || []).filter((s) => s.status === 'ACTIVE'));

    // Flatten class joins into a simple array for easy client‑side look‑up
    const flatClasses: ClassInfo[] = (clsRes.data || []).map((c: any) => ({
      id: c.id,
      class_date: c.class_date,
      start_time: c.start_time,
      end_time: c.end_time,
      subject_name: c.ground_school_subjects?.subject_name || 'Unknown',
      instructor_initials: c.instructors?.initials || '—',
    }));
    setClasses(flatClasses);
  }, []);

  // ============================================================
  // Load enrollments for the selected student
  // Enrich each enrollment with class details (date, time, subject, instructor)
  // ============================================================
  const loadEnrollments = useCallback(
    async (studentId: string) => {
      if (!studentId) return;
      const { data } = await supabase
        .from('ground_school_enrollment')
        .select('*')
        .eq('student_id', studentId)
        .order('class_id', { ascending: false });

      // For each enrollment, look up the corresponding class info
      // (class_id may be null for exempted entries)
      const enriched = (data || []).map((enr) => {
        const cls = classes.find((c) => c.id === enr.class_id);
        return {
          ...enr,
          class_date: cls?.class_date,
          start_time: cls?.start_time,
          end_time: cls?.end_time,
          subject_name: cls?.subject_name,
          instructor_initials: cls?.instructor_initials,
        };
      });
      setEnrollments(enriched);
    },
    [classes] // Re‑run when classes change
  );

  // ============================================================
  // Initial load & auto‑select student
  // Priority:
  //   1. URL parameter (?student=UUID) — from Progress page link
  //   2. Logged‑in student's own ID — for student role
  //   3. None — user must manually select
  // ============================================================
  useEffect(() => {
    const init = async () => {
      setLoading(true);

      // Load the static reference data first (subjects, students, classes)
      await loadStaticData();

      // Determine which student to auto‑select
      //
      // 2026-08-21 (security hardening round): a logged-in student must
      // NEVER be able to view another student's exam data by editing this
      // URL. Previously the ?student= param unconditionally won regardless
      // of role — a student could navigate to
      // ?student=<some-other-uuid> and see that student's DGCA roll number
      // and exam scores (the IDOR flagged in the whole-frontend security
      // review). The student-role branch is now checked FIRST and always
      // wins for that role: the URL param is only ever honored for
      // staff roles (admin/instructor/super_admin/operations) who are
      // expected to view arbitrary students via a link from the Flight
      // Progress page.
      if (userRole === 'student' && userStudentId) {
        // Priority 1: a student always sees only their own progress,
        // regardless of what (if anything) is in the URL.
        setSelectedStudent(userStudentId);
      } else if (studentParam) {
        // Priority 2: URL parameter (e.g., linked from Flight Progress page)
        // — staff roles only, per the branch above.
        setSelectedStudent(studentParam);
      }
      // Priority 3: Leave empty — admin/instructor will use the dropdown

      setLoading(false);
    };
    init();
  }, [loadStaticData, userRole, userStudentId, studentParam]);

  // Reload enrollments whenever the selected student changes
  useEffect(() => {
    if (selectedStudent) {
      loadEnrollments(selectedStudent);
    }
  }, [selectedStudent, loadEnrollments]);

  // ============================================================
  // Direct exam entry (for pre‑existing qualifications)
  // Creates a special enrollment record with EXEMPTED status.
  // Uses the same notes format as the Requirements Checklist sync
  // so both modules recognize the completion.
  //
  // 2026-08-19: this subject is examined by DGCA, not the FTO — a "pass"
  // recorded here should reflect the student's actual DGCA exam (roll
  // number + score they received), not a hardcoded 100/PASS fired off a
  // single confirm() dialog with zero real data collected. This now takes
  // the roll number and score from the modal form below instead.
  // ============================================================
  const addDirectExam = async (subjectId: number, rollNumber: string, score: number) => {
    if (!selectedStudent) return;

    const subject = subjects.find((s) => s.id === subjectId);
    if (!subject) return;

    // 2026-08-21 (security hardening round): this used to insert directly
    // into ground_school_enrollment from the browser with the anon key and
    // no role check at all — the "forged exam records" finding from the
    // whole-frontend security review (combined with the IDOR above, this
    // meant anyone could set an arbitrary PASS/score/roll number for any
    // student). Both the enrollment insert AND the Requirements Checklist
    // sync now happen server-side in one call — see
    // app/api/admin/ground-school/direct-exam/route.ts.
    const res = await fetch('/api/admin/ground-school/direct-exam', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: selectedStudent,
        subjectId,
        subjectName: subject.subject_name,
        rollNumber,
        score,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert('Error: ' + (data.error || 'Failed to record exam.'));
      return;
    }

    // Show success toast and reload
    setToastMessage('Subject marked as completed!');
    setTimeout(() => setToastMessage(''), 3000);
    loadEnrollments(selectedStudent);
  };

  // Validates and submits the Direct Exam Entry modal form.
  const submitDirectExam = async () => {
    if (!directExamModal) return;
    const rollNumber = directExamRollNumber.trim();
    const score = parseFloat(directExamScore);

    if (!rollNumber) {
      setDirectExamError('DGCA roll number is required to record a pass.');
      return;
    }
    if (directExamScore === '' || Number.isNaN(score) || score < 0 || score > 100) {
      setDirectExamError('Enter a valid exam score (0–100).');
      return;
    }

    setDirectExamError('');
    await addDirectExam(directExamModal.subjectId, rollNumber, score);
    setDirectExamModal(null);
    setDirectExamRollNumber('');
    setDirectExamScore('');
  };

  // ============================================================
  // Derived: progress per subject
  // Groups enrollments by subject and calculates attendance &
  // exam statistics.
  // ============================================================
  const subjectProgress = useMemo(() => {
    return subjects.map((subject) => {
      // Find all enrollments for this subject
      const subjectEnrollments = enrollments.filter((e) => {
        // Direct exempted entries have class_id = null — skip those here,
        // they're handled separately in the render logic
        if (e.class_id === null) return false;
        const cls = classes.find((c) => c.id === e.class_id);
        return cls && cls.subject_name === subject.subject_name;
      });

      const totalClasses = subjectEnrollments.length;
      const attended = subjectEnrollments.filter(
        (e) => e.attendance_status === 'PRESENT'
      ).length;
      const passed = subjectEnrollments.filter(
        (e) => e.exam_result === 'PASS'
      ).length;

      // Latest exam attempt (by exam_date)
      const latestExam = subjectEnrollments
        .filter((e) => e.exam_score !== null)
        .sort((a, b) =>
          (b.exam_date || '').localeCompare(a.exam_date || '')
        )[0];

      return {
        id: subject.id,
        name: subject.subject_name,
        code: subject.subject_code,
        totalClasses,
        attended,
        attendanceRate:
          totalClasses > 0 ? Math.round((attended / totalClasses) * 100) : 0,
        passed,
        latestScore: latestExam?.exam_score ?? null,
        latestResult: latestExam?.exam_result ?? null,
        attempts: latestExam?.attempts ?? 0,
      };
    });
  }, [subjects, enrollments, classes]);

  // ============================================================
  // Render
  // ============================================================
  useSetHeader({
    title: 'Student Ground School Progress',
    subtitle: 'Detailed per‑student theoretical training status',
    backUrl: '/dashboard/ground-school',
  });

  if (loading) {
    return (
      <ProtectedRoute>
        <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
          <p className="text-secondary">Loading...</p>
        </main>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <RoleGate
        allowedRoles={['admin', 'instructor', 'super_admin', 'student', 'operations']}
      >
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-7xl mx-auto px-4 py-6">
            {/* ----- Back to Flight Progress link ----- */}
            {/* Shows when a student is selected — allows quick navigation back */}
            {selectedStudent && (
              <div className="mb-4">
                <a
                  href={`/dashboard/progress?student=${selectedStudent}`}
                  className="text-sm transition flex items-center gap-1 w-fit"
                  style={{ color: 'var(--accent)' }}
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Flight Progress
                </a>
              </div>
            )}

            {/* ----- Student Selector (hidden for students) ----- */}
            {userRole !== 'student' && (
              <div className="surface-card p-4 mb-6">
                <label className="text-sm text-secondary block mb-2">
                  Select Student:
                </label>
                <select
                  value={selectedStudent}
                  onChange={(e) => setSelectedStudent(e.target.value)}
                  className="w-full md:w-96 surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="">Choose a student...</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.initials})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!selectedStudent ? (
              /* No student selected yet */
              <div className="text-center py-20 text-secondary">
                {userRole === 'student'
                  ? 'No student ID found in your profile.'
                  : 'Please select a student to view their progress.'}
              </div>
            ) : (
              <>
                {/* ============================================================ */}
                {/* SUBJECT PROGRESS CARDS                                        */}
                {/* ============================================================ */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                  {subjectProgress.map((subj) => {
                    // Check if this subject has been marked as exempted/completed
                    // We look for an EXEMPTED enrollment whose notes match
                    // the "Requirements Checklist: Subject Name" format
                    const isExempted = enrollments.some(
                      (e) =>
                        e.attendance_status === 'EXEMPTED' &&
                        e.notes ===
                          `Requirements Checklist: ${subj.name}`
                    );

                    const attendanceColor = subj.attendanceRate >= 80 ? 'var(--success)' : subj.attendanceRate >= 50 ? 'var(--warning-text)' : 'var(--danger)';

                    return (
                      <div
                        key={subj.id}
                        className="surface-inner p-4"
                        style={isExempted ? { borderColor: 'color-mix(in srgb, var(--success) 50%, transparent)' } : undefined}
                      >
                        {/* Subject name and code */}
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center space-x-2">
                            <h3 className="font-semibold">
                              {subj.name}
                            </h3>
                            {isExempted && (
                              <span className="badge badge-success flex items-center gap-1">
                                <CircleCheck className="w-3 h-3" /> Completed
                              </span>
                            )}
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded surface-muted text-secondary">
                            {subj.code}
                          </span>
                        </div>

                        {/* Exempted / Completed display */}
                        {isExempted ? (
                          <div className="text-xs mt-2 flex items-center gap-1" style={{ color: 'var(--success)' }}>
                            <GraduationCap className="w-3.5 h-3.5" /> Previously completed — no attendance required
                          </div>
                        ) : (
                          /* Regular progress display */
                          <>
                            {/* Attendance progress bar */}
                            <div className="mb-2">
                              <div className="flex justify-between text-xs text-tertiary mb-1">
                                <span>Attendance</span>
                                <span>
                                  {subj.attended}/{subj.totalClasses} (
                                  {subj.attendanceRate}%)
                                </span>
                              </div>
                              <div className="w-full rounded-full h-1.5" style={{ backgroundColor: 'var(--border)' }}>
                                <div
                                  className="h-1.5 rounded-full"
                                  style={{
                                    width: `${subj.attendanceRate}%`,
                                    backgroundColor: attendanceColor,
                                  }}
                                />
                              </div>
                            </div>

                            {/* Exam status */}
                            <div className="text-xs text-tertiary mt-3">
                              {subj.latestScore !== null ? (
                                <>
                                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                    Latest Score: {subj.latestScore}%
                                  </span>{' '}
                                  <span
                                    style={{ color: subj.latestResult === 'PASS' ? 'var(--success)' : 'var(--danger)' }}
                                  >
                                    ({subj.latestResult || 'N/A'})
                                  </span>
                                  <br />
                                  <span>Attempts: {subj.attempts}</span>
                                </>
                              ) : (
                                <span className="text-tertiary">
                                  No exam recorded yet.
                                </span>
                              )}
                            </div>

                            {/* Quick action: Mark as previously completed */}
                            <button
                              onClick={() => {
                                setDirectExamError('');
                                setDirectExamRollNumber('');
                                setDirectExamScore('');
                                setDirectExamModal({ subjectId: subj.id, subjectName: subj.name });
                              }}
                              className="mt-3 w-full text-xs surface-inner py-1.5 px-3 rounded transition hover:opacity-80 text-secondary flex items-center justify-center gap-1.5"
                            >
                              <GraduationCap className="w-3.5 h-3.5" /> Mark as Completed
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ============================================================ */}
                {/* CLASS & EXAM HISTORY TABLE                                   */}
                {/* ============================================================ */}
                <div className="surface-card p-6">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-secondary" /> Class & Exam History
                  </h2>

                  {enrollments.length === 0 ? (
                    <p className="text-secondary text-sm">
                      No ground school classes found.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                            <th className="pb-3">Subject</th>
                            <th className="pb-3">Date</th>
                            <th className="pb-3">Time</th>
                            <th className="pb-3">Instructor</th>
                            <th className="pb-3">Attendance</th>
                            <th className="pb-3">Score</th>
                            <th className="pb-3">Result</th>
                            <th className="pb-3">Attempts</th>
                            <th className="pb-3">Examiner</th>
                            <th className="pb-3">DGCA Roll No.</th>
                            <th className="pb-3">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="text-secondary">
                          {enrollments.map((enr) => {
                            const attendanceBadgeClass =
                              enr.attendance_status === 'PRESENT' ? 'badge-success' :
                              enr.attendance_status === 'ABSENT' ? 'badge-danger' :
                              enr.attendance_status === 'EXCUSED' ? 'badge-warning' :
                              enr.attendance_status === 'EXEMPTED' ? 'badge-accent' :
                              'badge-neutral';
                            return (
                            <tr
                              key={enr.id}
                              className="border-b transition hover:opacity-80"
                              style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}
                            >
                              {/* Subject name */}
                              <td className="py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                                {enr.subject_name || '—'}
                              </td>

                              {/* Class date */}
                              <td className="py-3">
                                {enr.class_date || '—'}
                              </td>

                              {/* Class time (start – end) */}
                              <td className="py-3 text-xs">
                                {enr.start_time?.slice(0, 5) || '—'} –{' '}
                                {enr.end_time?.slice(0, 5) || '—'}
                              </td>

                              {/* Instructor initials */}
                              <td className="py-3">
                                {enr.instructor_initials || '—'}
                              </td>

                              {/* Attendance status with colour coding */}
                              <td className="py-3">
                                <span className={`badge ${attendanceBadgeClass}`}>
                                  {enr.attendance_status}
                                </span>
                              </td>

                              {/* Exam score */}
                              <td className="py-3">
                                {enr.exam_score !== null
                                  ? `${enr.exam_score}%`
                                  : '—'}
                              </td>

                              {/* Exam result (Pass / Fail) */}
                              <td className="py-3">
                                {enr.exam_result ? (
                                  <span
                                    style={{ color: enr.exam_result === 'PASS' ? 'var(--success)' : 'var(--danger)' }}
                                  >
                                    {enr.exam_result}
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>

                              {/* Number of attempts */}
                              <td className="py-3 text-center">
                                {enr.attempts}
                              </td>

                              {/* Examiner name */}
                              <td className="py-3">
                                {enr.examiner || '—'}
                              </td>

                              {/* DGCA roll number */}
                              <td className="py-3 text-xs">
                                {enr.dgca_roll_number || '—'}
                              </td>

                              {/* Notes (truncated) */}
                              <td className="py-3 text-xs max-w-[120px] truncate">
                                {enr.notes || '—'}
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ----- Toast message ----- */}
          {toastMessage && (
            <div
              className="fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 animate-bounce flex items-center gap-2"
              style={{ backgroundColor: 'var(--success)', color: '#ffffff' }}
            >
              <CircleCheck className="w-4 h-4" />
              {toastMessage}
              <button
                onClick={() => setToastMessage('')}
                className="ml-3"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ----- Direct Exam Entry modal ----- */}
          {/* 2026-08-19: replaces the old one-click confirm() flow, which
              hardcoded exam_score=100/exam_result=PASS with no real DGCA
              exam data collected at all. This subject is examined by
              DGCA, not the FTO, so a recorded pass needs the student's
              actual DGCA roll number and the score they received. */}
          {directExamModal && (
            <div
              className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
              onClick={() => setDirectExamModal(null)}
            >
              <div
                className="surface-card w-full max-w-md shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div
                  className="flex items-center justify-between p-4 border-b rounded-t-xl"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
                >
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <GraduationCap className="w-4 h-4" /> Mark {directExamModal.subjectName} as Completed
                  </h3>
                  <button onClick={() => setDirectExamModal(null)} className="p-2 rounded-lg cursor-pointer hover:opacity-80" aria-label="Close">
                    <X className="w-5 h-5 text-tertiary" />
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  <p className="text-sm text-secondary">
                    {directExamModal.subjectName} is examined by DGCA, not the FTO — enter the student&apos;s
                    actual DGCA exam result to record this as completed and exempt them from attendance.
                  </p>

                  <div>
                    <label className="block text-sm text-secondary mb-1">DGCA Roll Number *</label>
                    <input
                      type="text"
                      value={directExamRollNumber}
                      onChange={e => setDirectExamRollNumber(e.target.value)}
                      placeholder="e.g., DGCA-2026-00123"
                      className="w-full surface-inner rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--accent)]"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-secondary mb-1">Exam Score Received *</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={directExamScore}
                      onChange={e => setDirectExamScore(e.target.value)}
                      placeholder="e.g., 85"
                      className="w-full surface-inner rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  {directExamError && (
                    <p className="text-xs" style={{ color: 'var(--danger)' }}>{directExamError}</p>
                  )}

                  <div className="flex space-x-2">
                    <button
                      onClick={submitDirectExam}
                      className="px-4 py-2 rounded-lg text-sm transition flex items-center gap-1.5 font-semibold"
                      style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
                    >
                      <CircleCheck className="w-3.5 h-3.5" /> Record Pass
                    </button>
                    <button
                      onClick={() => setDirectExamModal(null)}
                      className="px-4 py-2 rounded-lg text-sm transition surface-inner"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}
