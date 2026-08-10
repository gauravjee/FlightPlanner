// app/dashboard/ground-school/page.tsx
// Ground School Dashboard - Overview of all subjects, classes, and student progress
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { supabase } from '@/lib/supabase-client';
import Header from '@/components/ui/Header';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';

interface Subject { id: number; subject_name: string; subject_code: string; }
interface Enrollment { id: number; class_id: number; student_id: string; attendance_status: string; exam_score: number | null; exam_result: string | null; }

export default function GroundSchoolPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role;
  const userStudentId = (session?.user as any)?.studentId;

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (userRole === 'student' && userStudentId) {
      setSelectedStudent(userStudentId);
    }
  }, [userRole, userStudentId]);

  const loadData = async () => {
    setLoading(true);
    const [subjRes, enrollRes, classRes] = await Promise.all([
      supabase.from('ground_school_subjects').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('ground_school_enrollment').select('*'),
      supabase.from('ground_school_classes').select('*, ground_school_subjects(subject_name)').order('class_date', { ascending: false }).limit(10),
    ]);
    setSubjects(subjRes.data || []);
    setEnrollments(enrollRes.data || []);
    setClasses(classRes.data || []);
    setLoading(false);
  };

  // Calculate progress per subject
  const subjectProgress = useMemo(() => {
    return subjects.map(subject => {
      const subjectEnrollments = enrollments.filter(e => {
        const cls = classes.find(c => c.id === e.class_id);
        return cls?.subject_id === subject.id && (selectedStudent ? e.student_id === selectedStudent : true);
      });
      const total = subjectEnrollments.length;
      const completed = subjectEnrollments.filter(e => e.exam_result === 'PASS').length;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
      return { ...subject, total, completed, percent };
    });
  }, [subjects, enrollments, classes, selectedStudent]);

  // Upcoming classes
  const upcomingClasses = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return classes.filter((c: any) => c.class_date >= today && c.status === 'SCHEDULED').slice(0, 5);
  }, [classes]);

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-slate-400">Loading...</p></div>;

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={['admin', 'instructor', 'super_admin', 'student', 'operations']}>
        <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
          <Header title="🏫 Ground School" subtitle="Theoretical Training Progress" backUrl="/dashboard" />

          <div className="max-w-7xl mx-auto px-4 py-6">
            {/* Subject Progress Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {subjectProgress.map(subject => (
                <div key={subject.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                  <div className="flex justify-between mb-2">
                    <h3 className="text-white font-medium">{subject.subject_name}</h3>
                    <span className="text-xs text-slate-400">{subject.subject_code}</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
                    <div className={`h-2 rounded-full ${subject.percent >= 100 ? 'bg-green-500' : subject.percent >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${subject.percent}%` }} />
                  </div>
                  <p className="text-xs text-slate-400">{subject.completed}/{subject.total} completed ({subject.percent}%)</p>
                </div>
              ))}
            </div>

            {/* Upcoming Classes */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">📅 Upcoming Classes</h2>
              {upcomingClasses.length === 0 ? (
                <p className="text-slate-400 text-sm">No upcoming classes scheduled.</p>
              ) : (
                <div className="space-y-2">
                  {upcomingClasses.map((cls: any) => (
                    <div key={cls.id} className="bg-slate-900/50 rounded-lg p-3 flex justify-between">
                      <div>
                        <p className="text-white text-sm">{cls.ground_school_subjects?.subject_name || 'N/A'}</p>
                        <p className="text-xs text-slate-400">{cls.class_date} {cls.start_time} | {cls.topic || 'No topic'}</p>
                      </div>
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">{cls.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-6 flex flex-wrap gap-4">
            <a href="/dashboard/ground-school/schedule" className="bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg p-4 hover:scale-105 transition cursor-pointer no-underline block text-center">
                <p className="text-xl">📅</p>
                <p className="text-sm font-medium">Schedule Classes</p>
            </a>
            <a href="/dashboard/ground-school/attendance" className="bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-lg p-4 hover:scale-105 transition cursor-pointer no-underline block text-center">
                <p className="text-xl">📋</p>
                <p className="text-sm font-medium">Attendance & Exams</p>
            </a>
            <a
            href="/dashboard/ground-school/progress"
            className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg p-4 hover:scale-105 transition cursor-pointer no-underline block text-center"
            >
                <p className="text-xl">📊</p>
                <p className="text-sm font-medium">Student Progress</p>
            </a>
            </div>
          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}