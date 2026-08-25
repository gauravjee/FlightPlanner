// app/dashboard/ground-school/attendance/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase-client';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { Trash2, Plus, CircleCheck, X } from 'lucide-react';
import { syncRequirementsFromGroundSchoolPass } from '@/lib/ground-school-sync';

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

  // For adding students to class
  const [availableStudents, setAvailableStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');

  const loadClasses = useCallback(async () => {
    const { data } = await supabase
      .from('ground_school_classes')
      .select('id, class_date, start_time, end_time, subject_id, ground_school_subjects(subject_name)')
      .order('class_date', { ascending: false })
      .limit(30);
    setClasses((data || []) as unknown as GroundSchoolClassRow[]);
  }, []);

  const loadEnrollments = useCallback(async (classId: number) => {
    const { data } = await supabase
      .from('ground_school_enrollment')
      .select('*')
      .eq('class_id', classId);
    setEnrollments(data || []);
  }, []);

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

  const loadStudents = useCallback(async () => {
    setStudents(await fetchActiveStudents());
  }, [fetchActiveStudents]);

  const loadAvailableStudents = useCallback(async (classId: number) => {
    // Students not already enrolled
    const { data: enrolled } = await supabase
      .from('ground_school_enrollment')
      .select('student_id')
      .eq('class_id', classId);
    const enrolledIds = new Set((enrolled || []).map(e => e.student_id));
    const all = await fetchActiveStudents();
    setAvailableStudents(all.filter(s => !enrolledIds.has(s.id)));
  }, [fetchActiveStudents]);

  useEffect(() => {
    loadClasses();
    loadStudents();
  }, [loadClasses, loadStudents]);

  useEffect(() => {
    if (selectedClassId) {
      loadEnrollments(selectedClassId);
      loadAvailableStudents(selectedClassId);
      setLoading(false);
    }
  }, [selectedClassId, loadEnrollments, loadAvailableStudents]);

  const updateAttendance = async (enrollmentId: number, status: string) => {
    await supabase.from('ground_school_enrollment').update({ attendance_status: status }).eq('id', enrollmentId);
    if (selectedClassId) loadEnrollments(selectedClassId);
  };

  const updateExam = async (enrollmentId: number, field: string, value: string | number | null) => {
    // 2026-08-19: this subject's exam is conducted by DGCA, not the FTO —
    // a PASS recorded here needs to be traceable to the student's actual
    // DGCA roll number. Block (don't write) rather than silently save an
    // untraceable pass if the roll number hasn't been entered yet.
    if (field === 'exam_result' && value === 'PASS') {
      const enr = enrollments.find(e => e.id === enrollmentId);
      if (!enr?.dgca_roll_number?.trim()) {
        alert('Enter the DGCA roll number for this student before recording a pass — this exam is conducted by DGCA, not the FTO.');
        return;
      }
    }

    await supabase.from('ground_school_enrollment').update({ [field]: value }).eq('id', enrollmentId);

    // A passing exam result here should also complete the matching
    // Requirements Checklist item(s) for that subject — previously only
    // "Direct Exam Entry" (Ground School Progress page) did this; the
    // everyday attendance-page exam-recording flow silently never touched
    // the checklist at all. See lib/ground-school-sync.ts. One-directional
    // by design (a later FAIL doesn't un-complete a checklist item) — same
    // as the Direct Exam Entry flow this mirrors.
    if (field === 'exam_result' && value === 'PASS') {
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
  };

  const addStudentToClass = async () => {
    if (!selectedClassId || !selectedStudentId) return;
    await supabase.from('ground_school_enrollment').insert({
      class_id: selectedClassId,
      student_id: selectedStudentId,
      attendance_status: 'PENDING',
    });
    setSelectedStudentId('');
    loadEnrollments(selectedClassId);
    loadAvailableStudents(selectedClassId);
  };

  const removeStudent = async (enrollmentId: number) => {
    if (confirm('Remove student from this class?')) {
      await supabase.from('ground_school_enrollment').delete().eq('id', enrollmentId);
      loadEnrollments(selectedClassId!);
      loadAvailableStudents(selectedClassId!);
    }
  };

  const selectedClass = classes.find(c => c.id === selectedClassId);

  const inputClass = "surface-inner rounded px-2 py-1 text-xs focus:outline-none focus:border-[var(--accent)]";

  useSetHeader({ title: 'Ground School Attendance', subtitle: 'Track student attendance & exam results', backUrl: '/dashboard/ground-school' });

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={['admin', 'instructor', 'super_admin', 'operations']}>
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
                            <th className="pb-3">Result</th>
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
                                    value={enr.exam_score ?? ''}
                                    onChange={e => updateExam(enr.id, 'exam_score', e.target.value ? parseFloat(e.target.value) : null)}
                                    className={`w-16 ${inputClass}`}
                                  />
                                </td>
                                <td className="py-3">
                                  <select
                                    value={enr.exam_result || ''}
                                    onChange={e => updateExam(enr.id, 'exam_result', e.target.value || null)}
                                    className={inputClass}
                                  >
                                    <option value="">—</option>
                                    <option value="PASS">Pass</option>
                                    <option value="FAIL">Fail</option>
                                  </select>
                                </td>
                                <td className="py-3 text-center">{enr.attempts}</td>
                                <td className="py-3">
                                  <input
                                    type="text"
                                    value={enr.examiner}
                                    onChange={e => updateExam(enr.id, 'examiner', e.target.value)}
                                    className={`w-20 ${inputClass}`}
                                    placeholder="e.g., DGCA"
                                  />
                                </td>
                                <td className="py-3">
                                  <input
                                    type="text"
                                    value={enr.dgca_roll_number ?? ''}
                                    onChange={e => updateExam(enr.id, 'dgca_roll_number', e.target.value)}
                                    className={`w-24 ${inputClass}`}
                                    placeholder="Required for PASS"
                                  />
                                </td>
                                <td className="py-3">
                                  <input
                                    type="text"
                                    value={enr.notes}
                                    onChange={e => updateExam(enr.id, 'notes', e.target.value)}
                                    className={`w-32 ${inputClass}`}
                                  />
                                </td>
                                <td className="py-3">
                                  <button onClick={() => removeStudent(enr.id)} className="px-2 py-1 rounded transition" style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>
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
