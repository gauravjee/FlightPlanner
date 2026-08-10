// app/dashboard/ground-school/attendance/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase-client';
import { useSession } from 'next-auth/react';
import Header from '@/components/ui/Header';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';

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
  // joined
  student_name?: string;
  student_initials?: string;
}

export default function AttendancePage() {
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // For adding students to class
  const [availableStudents, setAvailableStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');

  const loadClasses = useCallback(async () => {
    const { data } = await supabase
      .from('ground_school_classes')
      .select('id, class_date, start_time, end_time, subject_id, ground_school_subjects(subject_name)')
      .order('class_date', { ascending: false })
      .limit(30);
    setClasses(data || []);
  }, []);

  const loadEnrollments = useCallback(async (classId: number) => {
    const { data } = await supabase
      .from('ground_school_enrollment')
      .select('*')
      .eq('class_id', classId);
    setEnrollments(data || []);
  }, []);

  const loadStudents = useCallback(async () => {
    const { data } = await supabase
      .from('students')
      .select('id, name, initials')
      .eq('status', 'ACTIVE');
    setStudents(data || []);
  }, []);

  const loadAvailableStudents = useCallback(async (classId: number) => {
    // Students not already enrolled
    const { data: enrolled } = await supabase
      .from('ground_school_enrollment')
      .select('student_id')
      .eq('class_id', classId);
    const enrolledIds = new Set((enrolled || []).map(e => e.student_id));
    const { data: all } = await supabase
      .from('students')
      .select('id, name, initials')
      .eq('status', 'ACTIVE');
    setAvailableStudents((all || []).filter(s => !enrolledIds.has(s.id)));
  }, []);

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

  const updateExam = async (enrollmentId: number, field: string, value: any) => {
    await supabase.from('ground_school_enrollment').update({ [field]: value }).eq('id', enrollmentId);
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

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={['admin', 'instructor', 'super_admin', 'operations']}>
        <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
          <Header title="📋 Ground School Attendance" subtitle="Track student attendance & exam results" backUrl="/dashboard/ground-school" />

          <div className="max-w-7xl mx-auto px-4 py-6">
            {/* Class Selector */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-6">
              <label className="text-sm text-slate-400 block mb-2">Select a Class:</label>
              <select
                value={selectedClassId || ''}
                onChange={e => { setSelectedClassId(e.target.value ? parseInt(e.target.value) : null); setLoading(true); }}
                className="w-full md:w-96 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
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
              <p className="text-slate-400 text-center py-10">Select a class to view attendees.</p>
            ) : loading ? (
              <p className="text-slate-400 text-center py-10">Loading...</p>
            ) : (
              <>
                {/* Enrolled Students */}
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-6">
                  <h3 className="text-lg font-semibold text-white mb-3">Enrolled Students</h3>
                  {enrollments.length === 0 ? (
                    <p className="text-slate-400">No students enrolled yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-400 border-b border-slate-700">
                            <th className="pb-3">Student</th>
                            <th className="pb-3">Attendance</th>
                            <th className="pb-3">Exam Score</th>
                            <th className="pb-3">Result</th>
                            <th className="pb-3">Attempts</th>
                            <th className="pb-3">Examiner</th>
                            <th className="pb-3">Notes</th>
                            <th className="pb-3">Action</th>
                          </tr>
                        </thead>
                        <tbody className="text-slate-300">
                          {enrollments.map(enr => {
                            const student = students.find(s => s.id === enr.student_id);
                            return (
                              <tr key={enr.id} className="border-b border-slate-700/50">
                                <td className="py-3 text-white font-medium">{student?.name || enr.student_id}</td>
                                <td className="py-3">
                                  <select
                                    value={enr.attendance_status}
                                    onChange={e => updateAttendance(enr.id, e.target.value)}
                                    className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs"
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
                                    className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs"
                                  />
                                </td>
                                <td className="py-3">
                                  <select
                                    value={enr.exam_result || ''}
                                    onChange={e => updateExam(enr.id, 'exam_result', e.target.value || null)}
                                    className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs"
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
                                    className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs"
                                    placeholder="e.g., DGCA"
                                  />
                                </td>
                                <td className="py-3">
                                  <input
                                    type="text"
                                    value={enr.notes}
                                    onChange={e => updateExam(enr.id, 'notes', e.target.value)}
                                    className="w-32 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs"
                                  />
                                </td>
                                <td className="py-3">
                                  <button onClick={() => removeStudent(enr.id)} className="text-red-400 hover:text-red-300">🗑️</button>
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
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                  <h3 className="text-lg font-semibold text-white mb-3">➕ Enroll Additional Student</h3>
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-slate-400 block mb-1">Student</label>
                      <select
                        value={selectedStudentId}
                        onChange={e => setSelectedStudentId(e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
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
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}