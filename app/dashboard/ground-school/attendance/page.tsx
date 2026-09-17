// app/dashboard/ground-school/attendance/page.tsx
//
// 2026-09-16: the four free-text/number exam fields are UNCONTROLLED
// (defaultValue + onBlur). They used to be controlled with onBlur-less
// onChange, which fired a PATCH per keystroke — "ABC123" was six writes, six
// re-fetches, and six chances to interleave out of order. The two selects
// stay on onChange: one discrete choice, one write. The onBlur handlers
// compare against the current row first so tabbing through without editing
// writes nothing.
//
// 2026-09-18: the Result column is now READ-ONLY. A DGCA pass is 70%
// (lib/dgca.ts), so the result follows from the score and is derived and
// stored server-side by the enrollment route. There is no Pass/Fail dropdown
// to disagree with the score any more.
'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase-client';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Trash2, Plus, CircleCheck, X } from 'lucide-react';
import { GROUND_SCHOOL_WRITE_ROLES } from '@/lib/permissions';
import { syncRequirementsFromGroundSchoolPass } from '@/lib/ground-school-sync';
import { DGCA_PASS_MARK } from '@/lib/dgca';

interface Student {
  id: string; // UUID
  name: string;
  initials: string;
}

interface Enrollment {
  id: number;
  class_id: number;
  student_id: string;
  attendance_status: string;
  exam_score: number | null;
  exam_result: string | null;
  exam_date: string | null;
  attempts: number;
  examiner: string;
  notes: string;
  // 2026-08-19: this exam is conducted by DGCA, not the FTO — required by
  // the app before a PASS can be recorded (see updateExam below). See
  // add-dgca-roll-number-to-ground-school.sql.
  dgca_roll_number: string | null;
  // joined
  student_name?: string;
  student_initials?: string;
}

interface GroundSchoolClassRow {
  id: number;
  class_date: string;
  start_time: string;
  end_time: string;
  subject_id: number;
  status?: string;
  ground_school_subjects?: { subject_name: string } | null;
}

export default function AttendancePage() {
  const [classes, setClasses] = useState<GroundSchoolClassRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState('');
  // Replaces native confirm() on remove — see removeStudent below.
  const [removeTarget, setRemoveTarget] = useState<Enrollment | null>(null);

  // For adding students to class
  const [availableStudents, setAvailableStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');

  // Pure fetches — no setState in any of these, so they're safe to call
  // from an effect too (react-hooks/set-state-in-effect flags any named
  // function that sets state anywhere in its body, even safely after an
  // await, when called from an effect — so the state-setting has to live
  // at each call site instead).
  const fetchClasses = async (): Promise<GroundSchoolClassRow[]> => {
    const { data } = await supabase
      .from('ground_school_classes')
      .select('id, class_date, start_time, end_time, subject_id, ground_school_subjects(subject_name)')
      .order('class_date', { ascending: false })
      .limit(30);
    return (data || []) as unknown as GroundSchoolClassRow[];
  };

  const fetchEnrollments = async (classId: number): Promise<Enrollment[]> => {
    const { data } = await supabase
      .from('ground_school_enrollment')
      .select('*')
      .eq('class_id', classId);
    return data || [];
  };

  // Fetches active students via the role-scoped /api/students route
  // (not a direct Supabase call — see app/api/students/route.ts) so this
  // keeps working once the anon key can no longer read the `students`
  // table directly.
  const fetchActiveStudents = useCallback(async (): Promise<Student[]> => {
    const res = await fetch('/api/students');
    if (!res.ok) return [];
    const { students: rows } = (await res.json()) as {
      students: { id: string; name: string; initials: string; status: string }[];
    };
    return (rows || [])
      .filter((r) => r.status === 'ACTIVE')
      .map((r) => ({ id: r.id, name: r.name, initials: r.initials }));
  }, []);

  // useCallback (rather than a plain function, like fetchEnrollments above
  // it) because this one calls another component-scoped function
  // (fetchActiveStudents) — the exhaustive-deps rule can't prove a fresh
  // closure over that reference is stable, so it flags the effect below
  // that calls this. Memoizing both settles it.
  const fetchAvailableStudents = useCallback(async (classId: number): Promise<Student[]> => {
    // Students not already enrolled
    const { data: enrolled } = await supabase
      .from('ground_school_enrollment')
      .select('student_id')
      .eq('class_id', classId);
    const enrolledIds = new Set((enrolled || []).map(e => e.student_id));
    const all = await fetchActiveStudents();
    return all.filter(s => !enrolledIds.has(s.id));
  }, [fetchActiveStudents]);

  // Used by the attendance/exam/add/remove handlers below — event-handler
  // calls, where setState is always fine.
  const loadEnrollments = async (classId: number) => {
    setEnrollments(await fetchEnrollments(classId));
  };

  const loadAvailableStudents = async (classId: number) => {
    setAvailableStudents(await fetchAvailableStudents(classId));
  };

  useEffect(() => {
    fetchClasses().then(setClasses);
    fetchActiveStudents().then(setStudents);
  }, [fetchActiveStudents]);

  // Loads the enrolled + available student lists for the selected class.
  // Previously this fired loadEnrollments/loadAvailableStudents (fire-and-
  // forget) and then setLoading(false) immediately afterward, in the same
  // synchronous tick — the "Loading..." state cleared before either async
  // fetch had actually resolved. Waiting on both here fixes that too.
  useEffect(() => {
    if (selectedClassId) {
      Promise.all([fetchEnrollments(selectedClassId), fetchAvailableStudents(selectedClassId)])
        .then(([enr, avail]) => {
          setEnrollments(enr);
          setAvailableStudents(avail);
          setLoading(false);
        });
    }
  }, [selectedClassId, fetchAvailableStudents]);

  // 2026-09-16: these four writes used to go straight to Supabase with the
  // public anon key — the RoleGate above decided what rendered, nothing
  // decided what the database accepted. They now go through
  // app/api/ground-school/enrollment/route.ts, which re-checks the same role
  // list server-side. See that route's header for the full background.
  // Returns the route's response body on success, or null on failure — the
  // caller needs `examResult` from it, which only the server can decide.
  const patchEnrollment = async (
    enrollmentId: number,
    field: string,
    value: string | number | null,
  ): Promise<{ examResult?: string | null } | null> => {
    const res = await fetch('/api/ground-school/enrollment', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollmentId, field, value }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Surfaced, not swallowed: a rejected write that silently does nothing
      // is the exact failure mode the DebriefForm false-success bug was.
      setToastMessage(`❌ ${body.error || 'Could not save that change.'}`);
      setTimeout(() => setToastMessage(''), 6000);
      return null;
    }
    return body;
  };

  const updateAttendance = async (enrollmentId: number, status: string) => {
    const ok = await patchEnrollment(enrollmentId, 'attendance_status', status);
    if (ok && selectedClassId) loadEnrollments(selectedClassId);
  };

  // Returns true only if the value was actually stored. An uncontrolled input
  // does NOT reset itself when the write is refused — React re-rendering with
  // unchanged data leaves the DOM node holding what was typed — so the caller
  // has to put the field back by hand. Found live on 2026-09-18: a blocked
  // score of 85 stayed on screen while the database still held 70.
  const updateExam = async (enrollmentId: number, field: string, value: string | number | null): Promise<boolean> => {
    // DGCA issues a roll number per sitting, so EVERY recorded score needs
    // one — not just a passing score. Checked here only to give an immediate,
    // specific message; the route enforces it regardless of whether this ran.
    if (field === 'exam_score' && value !== null) {
      const enr = enrollments.find(e => e.id === enrollmentId);
      if (!enr?.dgca_roll_number?.trim()) {
        // Toast, not alert(): native dialogs block the tab, ignore the theme,
        // and get auto-suppressed by remote browser tooling. Same reasoning as
        // components/ui/ConfirmDialog.tsx.
        setToastMessage('❌ Enter the DGCA roll number for this attempt before recording a score — this exam is conducted by DGCA, not the FTO, and every sitting has its own roll number.');
        setTimeout(() => setToastMessage(''), 6000);
        return false;
      }
    }

    const result = await patchEnrollment(enrollmentId, field, value);
    if (!result) return false;

    // A passing exam result here should also complete the matching
    // Requirements Checklist item(s) for that subject. One-directional by
    // design: a later FAIL does not un-complete a checklist item, and a FAIL
    // never completes one — so the requirement stays open across as many
    // attempts as it takes until one of them clears 70%.
    if (result.examResult === 'PASS') {
      const enr = enrollments.find(e => e.id === enrollmentId);
      const subjectName = selectedClass?.ground_school_subjects?.subject_name;
      if (enr && subjectName) {
        // completedBy dropped 2026-08-19 — the server derives it from the
        // signed-in session instead of a hardcoded placeholder string.
        const toggledCount = await syncRequirementsFromGroundSchoolPass(enr.student_id, subjectName);
        if (toggledCount > 0) {
          setToastMessage(`Requirements Checklist updated for ${subjectName}.`);
          setTimeout(() => setToastMessage(''), 3000);
        }
      }
    }

    if (selectedClassId) loadEnrollments(selectedClassId);
    return true;
  };

  const addStudentToClass = async () => {
    if (!selectedClassId || !selectedStudentId) return;
    const res = await fetch('/api/ground-school/enrollment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId: selectedClassId, studentId: selectedStudentId }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: '' }));
      setToastMessage(`❌ ${error || 'Could not add that student.'}`);
      setTimeout(() => setToastMessage(''), 5000);
      return;
    }
    setSelectedStudentId('');
    loadEnrollments(selectedClassId);
    loadAvailableStudents(selectedClassId);
  };

  const removeStudent = async (enrollmentId: number) => {
    setRemoveTarget(null);
    const res = await fetch(`/api/ground-school/enrollment?enrollmentId=${enrollmentId}`, { method: 'DELETE' });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: '' }));
      setToastMessage(`❌ ${error || 'Could not remove that student.'}`);
      setTimeout(() => setToastMessage(''), 5000);
      return;
    }
    loadEnrollments(selectedClassId!);
    loadAvailableStudents(selectedClassId!);
  };

  const selectedClass = classes.find(c => c.id === selectedClassId);

  const inputClass = "surface-inner rounded px-2 py-1 text-xs focus:outline-none focus:border-[var(--accent)]";

  useSetHeader({ title: 'Ground School Attendance', subtitle: 'Track student attendance & exam results', backUrl: '/dashboard/ground-school' });

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={GROUND_SCHOOL_WRITE_ROLES}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-7xl mx-auto px-4 py-6">
            {/* Class Selector */}
            <div className="surface-card p-4 mb-6">
              <label className="text-sm text-secondary block mb-2">Select a Class:</label>
              <select
                value={selectedClassId || ''}
                onChange={e => { setSelectedClassId(e.target.value ? parseInt(e.target.value) : null); setLoading(true); }}
                className="w-full md:w-96 surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="">Choose...</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.class_date} - {c.ground_school_subjects?.subject_name} ({c.start_time?.slice(0,5)}-{c.end_time?.slice(0,5)})
                  </option>
                ))}
              </select>
            </div>

            {!selectedClassId ? (
              <p className="text-secondary text-center py-10">Select a class to view attendees.</p>
            ) : loading ? (
              <p className="text-secondary text-center py-10">Loading...</p>
            ) : (
              <>
                {/* Enrolled Students */}
                <div className="surface-card p-4 mb-6">
                  <h3 className="text-lg font-semibold mb-3">Enrolled Students</h3>
                  {enrollments.length === 0 ? (
                    <p className="text-secondary">No students enrolled yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                            <th className="pb-3">Student</th>
                            <th className="pb-3">Attendance</th>
                            <th className="pb-3">Exam Score</th>
                            <th className="pb-3">Result ({DGCA_PASS_MARK}% to pass)</th>
                            <th className="pb-3">Attempts</th>
                            <th className="pb-3">Examiner</th>
                            <th className="pb-3">DGCA Roll No.</th>
                            <th className="pb-3">Notes</th>
                            <th className="pb-3">Action</th>
                          </tr>
                        </thead>
                        <tbody className="text-secondary">
                          {enrollments.map(enr => {
                            const student = students.find(s => s.id === enr.student_id);
                            return (
                              <tr key={enr.id} className="border-b" style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
                                <td className="py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{student?.name || enr.student_id}</td>
                                <td className="py-3">
                                  <select
                                    value={enr.attendance_status}
                                    onChange={e => updateAttendance(enr.id, e.target.value)}
                                    className={inputClass}
                                  >
                                    <option value="PENDING">Pending</option>
                                    <option value="PRESENT">Present</option>
                                    <option value="ABSENT">Absent</option>
                                    <option value="EXCUSED">Excused</option>
                                  </select>
                                </td>
                                <td className="py-3">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    defaultValue={enr.exam_score ?? ''}
                                    onBlur={async e => {
                                      const el = e.currentTarget;   // captured: gone after the await
                                      const raw = el.value.trim();
                                      const next = raw === '' ? null : Number(raw);
                                      // Number('') is 0 and parseFloat('abc') is NaN — both would
                                      // store a score the examiner never entered.
                                      if (next !== null && !Number.isFinite(next)) { el.value = String(enr.exam_score ?? ''); return; }
                                      if (next === (enr.exam_score ?? null)) return;
                                      const stored = await updateExam(enr.id, 'exam_score', next);
                                      // Refused: show what the database actually holds, not what
                                      // was typed. This input is uncontrolled, so nothing else does it.
                                      if (!stored) el.value = String(enr.exam_score ?? '');
                                    }}
                                    className={`w-16 ${inputClass}`}
                                  />
                                </td>
                                <td className="py-3">
                                  {/* Read-only: derived from the score by the route. */}
                                  <span
                                    className="text-xs font-semibold"
                                    style={{ color: enr.exam_result === 'PASS' ? 'var(--success)' : enr.exam_result === 'FAIL' ? 'var(--danger)' : 'var(--text-tertiary)' }}
                                  >
                                    {enr.exam_result || '—'}
                                  </span>
                                </td>
                                <td className="py-3 text-center">{enr.attempts}</td>
                                <td className="py-3">
                                  <input
                                    type="text"
                                    defaultValue={enr.examiner}
                                    onBlur={e => { if (e.target.value !== enr.examiner) updateExam(enr.id, 'examiner', e.target.value); }}
                                    className={`w-20 ${inputClass}`}
                                    placeholder="e.g., DGCA"
                                  />
                                </td>
                                <td className="py-3">
                                  <input
                                    type="text"
                                    defaultValue={enr.dgca_roll_number ?? ''}
                                    onBlur={async e => {
                                      const el = e.currentTarget;
                                      if (el.value === (enr.dgca_roll_number ?? '')) return;
                                      const stored = await updateExam(enr.id, 'dgca_roll_number', el.value);
                                      if (!stored) el.value = enr.dgca_roll_number ?? '';
                                    }}
                                    className={`w-24 ${inputClass}`}
                                    placeholder="Required"
                                  />
                                </td>
                                <td className="py-3">
                                  <input
                                    type="text"
                                    defaultValue={enr.notes}
                                    onBlur={e => { if (e.target.value !== enr.notes) updateExam(enr.id, 'notes', e.target.value); }}
                                    className={`w-32 ${inputClass}`}
                                  />
                                </td>
                                <td className="py-3">
                                  <button onClick={() => setRemoveTarget(enr)} className="px-2 py-1 rounded transition" style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }} aria-label={`Remove ${student?.name || enr.student_id}`}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Add Student to Class */}
                <div className="surface-card p-4">
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-secondary" /> Enroll Additional Student
                  </h3>
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-tertiary block mb-1">Student</label>
                      <select
                        value={selectedStudentId}
                        onChange={e => setSelectedStudentId(e.target.value)}
                        className="w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                      >
                        <option value="">Select student...</option>
                        {availableStudents.map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.initials})</option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={addStudentToClass}
                      disabled={!selectedStudentId}
                      className="px-4 py-2 rounded-lg text-sm transition disabled:opacity-50 font-semibold"
                      style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {removeTarget && (
            <ConfirmDialog
              title="Remove student"
              message={`Remove ${students.find(s => s.id === removeTarget.student_id)?.name || removeTarget.student_id} from this class? Their attendance and exam record for it will be deleted.`}
              confirmLabel="Remove"
              onConfirm={() => removeStudent(removeTarget.id)}
              onCancel={() => setRemoveTarget(null)}
            />
          )}

          {/* Toast — confirms a passing exam result also completed the
              matching Requirements Checklist item(s), so this isn't silent. */}
          {toastMessage && (
            <div
              className="fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2"
              style={{ backgroundColor: 'var(--success)', color: '#ffffff' }}
            >
              <CircleCheck className="w-4 h-4" />
              {toastMessage}
              <button onClick={() => setToastMessage('')} className="ml-3">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}
