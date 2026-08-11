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
import { useFlightStore } from '@/lib/store';

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

 // const { trainingRequirements, loadTrainingRequirements, toggleRequirement } = useFlightStore();
  const { loadTrainingRequirements, toggleRequirement, trainingRequirements } = useFlightStore();

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

  // 2. Also update the Requirements Checklist
  // Load the latest requirements for this student
  await loadTrainingRequirements(selectedStudent);
  
  // Find matching requirement(s) — uses includes() for names with suffixes
  const currentReqs = useFlightStore.getState().trainingRequirements;
  const matchingReqs = currentReqs.filter(
    (r) =>
      r.studentId === selectedStudent &&
      r.requirementName.includes(subject.subject_name)
  );

  // Toggle each matching requirement to completed
  for (const req of matchingReqs) {
    if (!req.isCompleted) {
      await toggleRequirement(req.id, true, 'Ground School Module');
    }
  }

  // Show success toast and reload
  setToastMessage('✅ Subject marked as completed!');
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
        <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
          <p className="text-slate-400">Loading...</p>
        </main>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <RoleGate
        allowedRoles={['admin', 'instructor', 'super_admin', 'student', 'operations']}
      >
        <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
          <Header
            title="📊 Student Ground School Progress"
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
                  className="text-sm text-teal-400 hover:text-teal-300 transition"
                >
                  ← Back to Flight Progress
                </a>
              </div>
            )}

            {/* ----- Student Selector (hidden for students) ----- */}
            {userRole !== 'student' && (
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-6">
                <label className="text-sm text-slate-400 block mb-2">
                  Select Student:
                </label>
                <select
                  value={selectedStudent}
                  onChange={(e) => setSelectedStudent(e.target.value)}
                  className="w-full md:w-96 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
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
              <div className="text-center py-20 text-slate-400">
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

                    return (
                      <div
                        key={subj.id}
                        className={`bg-slate-800/50 border rounded-xl p-4 ${
                          isExempted
                            ? 'border-green-500/50'
                            : 'border-slate-700'
                        }`}
                      >
                        {/* Subject name and code */}
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center space-x-2">
                            <h3 className="text-white font-semibold">
                              {subj.name}
                            </h3>
                            {isExempted && (
                              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
                                ✅ Completed
                              </span>
                            )}
                          </div>
                          <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
                            {subj.code}
                          </span>
                        </div>

                        {/* Exempted / Completed display */}
                        {isExempted ? (
                          <div className="text-xs text-green-400 mt-2">
                            🎓 Previously completed — no attendance required
                          </div>
                        ) : (
                          /* Regular progress display */
                          <>
                            {/* Attendance progress bar */}
                            <div className="mb-2">
                              <div className="flex justify-between text-xs text-slate-400 mb-1">
                                <span>Attendance</span>
                                <span>
                                  {subj.attended}/{subj.totalClasses} (
                                  {subj.attendanceRate}%)
                                </span>
                              </div>
                              <div className="w-full bg-slate-700 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full ${
                                    subj.attendanceRate >= 80
                                      ? 'bg-green-500'
                                      : subj.attendanceRate >= 50
                                      ? 'bg-yellow-500'
                                      : 'bg-red-500'
                                  }`}
                                  style={{
                                    width: `${subj.attendanceRate}%`,
                                  }}
                                />
                              </div>
                            </div>

                            {/* Exam status */}
                            <div className="text-xs text-slate-400 mt-3">
                              {subj.latestScore !== null ? (
                                <>
                                  <span className="text-white font-medium">
                                    Latest Score: {subj.latestScore}%
                                  </span>{' '}
                                  <span
                                    className={
                                      subj.latestResult === 'PASS'
                                        ? 'text-green-400'
                                        : 'text-red-400'
                                    }
                                  >
                                    ({subj.latestResult || 'N/A'})
                                  </span>
                                  <br />
                                  <span>Attempts: {subj.attempts}</span>
                                </>
                              ) : (
                                <span className="text-slate-500">
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
                              className="mt-3 w-full text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 py-1.5 px-3 rounded transition"
                            >
                              🎓 Mark as Completed
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
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                  <h2 className="text-lg font-semibold text-white mb-4">
                    📋 Class & Exam History
                  </h2>

                  {enrollments.length === 0 ? (
                    <p className="text-slate-400 text-sm">
                      No ground school classes found.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-400 border-b border-slate-700">
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
                        <tbody className="text-slate-300">
                          {enrollments.map((enr) => (
                            <tr
                              key={enr.id}
                              className="border-b border-slate-700/50 hover:bg-slate-700/30"
                            >
                              {/* Subject name */}
                              <td className="py-3 font-medium text-white">
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
                                <span
                                  className={`px-2 py-0.5 rounded text-xs ${
                                    enr.attendance_status === 'PRESENT'
                                      ? 'bg-green-500/20 text-green-400'
                                      : enr.attendance_status === 'ABSENT'
                                      ? 'bg-red-500/20 text-red-400'
                                      : enr.attendance_status === 'EXCUSED'
                                      ? 'bg-yellow-500/20 text-yellow-400'
                                      : enr.attendance_status === 'EXEMPTED'
                                      ? 'bg-indigo-500/20 text-indigo-400'
                                      : 'bg-slate-500/20 text-slate-400'
                                  }`}
                                >
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
                                    className={
                                      enr.exam_result === 'PASS'
                                        ? 'text-green-400'
                                        : 'text-red-400'
                                    }
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
                          ))}
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
            <div className="fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-bounce">
              {toastMessage}
              <button
                onClick={() => setToastMessage('')}
                className="ml-3 font-bold"
              >
                ✕
              </button>
            </div>
          )}
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}