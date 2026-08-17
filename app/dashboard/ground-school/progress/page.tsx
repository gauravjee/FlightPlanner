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
import Header from '@/components/ui/Header';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { syncRequirementsFromGroundSchoolPass } from '@/lib/ground-school-sync';
import { ArrowLeft, GraduationCap, ClipboardList, CircleCheck, X } from 'lucide-react';

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
      if (studentParam) {
        // Priority 1: URL parameter (e.g., linked from Flight Progress page)
        setSelectedStudent(studentParam);
      } else if (userRole === 'student' && userStudentId) {
        // Priority 2: Student viewing their own progress
        setSelectedStudent(userStudentId);
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
  // ============================================================
  const addDirectExam = async (subjectId: number) => {
  if (!selectedStudent) return;

  const subject = subjects.find((s) => s.id === subjectId);
  if (!subject) return;

  // 1. Create EXEMPTED enrollment in ground_school_enrollment
  const { error } = await supabase.from('ground_school_enrollment').insert([
    {
      class_id: null,
      student_id: selectedStudent,
      attendance_status: 'EXEMPTED',
      exam_score: 100,
      exam_result: 'PASS',
      exam_date: new Date().toISOString().split('T')[0],
      attempts: 1,
      examiner: 'Ground School Module',
      notes: `Requirements Checklist: ${subject.subject_name}`,
    },
  ]);

  if (error) {
    alert('Error: ' + error.message);
    return;
  }

  // 2. Also update the Requirements Checklist — shared with the attendance
  // page's own exam-recording flow, see lib/ground-school-sync.ts.
  await syncRequirementsFromGroundSchoolPass(selectedStudent, subject.subject_name, 'Ground School Module');

  // Show success toast and reload
  setToastMessage('Subject marked as completed!');
  setTimeout(() => setToastMessage(''), 3000);
  loadEnrollments(selectedStudent);
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
          <Header
            title="Student Ground School Progress"
            subtitle="Detailed per‑student theoretical training status"
            backUrl="/dashboard/ground-school"
          />

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
                                if (
                                  confirm(
                                    `Mark ${subj.name} as previously completed? This will exempt the student from attendance requirements.`
                                  )
                                ) {
                                  addDirectExam(subj.id);
                                }
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
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}
