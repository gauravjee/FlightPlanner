// app/dashboard/ground-school/page.tsx
// Ground School Dashboard - Overview of all subjects, classes, and student progress
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { supabase } from '@/lib/supabase-client';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { Calendar, ClipboardList, ChartColumn } from 'lucide-react';

interface Subject { id: number; subject_name: string; subject_code: string; }
interface Enrollment { id: number; class_id: number; student_id: string; attendance_status: string; exam_score: number | null; exam_result: string | null; }
interface GroundSchoolClassRow {
  id: number;
  class_date: string;
  start_time: string;
  end_time: string;
  subject_id: number;
  topic?: string;
  status: string;
  ground_school_subjects?: { subject_name: string } | null;
}

export default function GroundSchoolPage() {
  const { data: session } = useSession();
  const userRole = session?.user?.role;
  const userStudentId = session?.user?.studentId;

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [classes, setClasses] = useState<GroundSchoolClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Not stored state — a student's own ID from the session always wins for
  // that role (they never get a picker here), and nothing else ever sets
  // this, so it's a plain derived value rather than state synced via an
  // effect.
  const selectedStudent = userRole === 'student' && userStudentId ? userStudentId : '';

  // Pure fetch — no setState here, so it's safe to call from an effect too
  // (react-hooks/set-state-in-effect flags any named function that sets
  // state anywhere in its body, even safely after an await, when called
  // from an effect).
  const fetchGroundSchoolData = async () => {
    const [subjRes, enrollRes, classRes] = await Promise.all([
      supabase.from('ground_school_subjects').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('ground_school_enrollment').select('*'),
      supabase.from('ground_school_classes').select('*, ground_school_subjects(subject_name)').order('class_date', { ascending: false }).limit(10),
    ]);
    return {
      subjects: subjRes.data || [],
      enrollments: enrollRes.data || [],
      classes: classRes.data || [],
    };
  };

  useEffect(() => {
    fetchGroundSchoolData().then(data => {
      setSubjects(data.subjects);
      setEnrollments(data.enrollments);
      setClasses(data.classes);
      setLoading(false);
    });
  }, []);

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
    return classes.filter((c) => c.class_date >= today && c.status === 'SCHEDULED').slice(0, 5);
  }, [classes]);

  useSetHeader({ title: 'Ground School', subtitle: 'Theoretical Training Progress', backUrl: '/dashboard' });

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
      <p className="text-secondary">Loading...</p>
    </div>
  );

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={['admin', 'instructor', 'super_admin', 'student', 'operations']}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-7xl mx-auto px-4 py-6">
            {/* Subject Progress Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {subjectProgress.map(subject => {
                const barColor = subject.percent >= 100 ? 'var(--success)' : subject.percent >= 50 ? 'var(--warning-text)' : 'var(--danger)';
                return (
                  <div key={subject.id} className="surface-inner p-4">
                    <div className="flex justify-between mb-2">
                      <h3 className="font-medium">{subject.subject_name}</h3>
                      <span className="text-xs text-tertiary">{subject.subject_code}</span>
                    </div>
                    <div className="w-full rounded-full h-2 mb-2" style={{ backgroundColor: 'var(--border)' }}>
                      <div className="h-2 rounded-full" style={{ width: `${subject.percent}%`, backgroundColor: barColor }} />
                    </div>
                    <p className="text-xs text-tertiary">{subject.completed}/{subject.total} completed ({subject.percent}%)</p>
                  </div>
                );
              })}
            </div>

            {/* Upcoming Classes */}
            <div className="surface-card p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-secondary" /> Upcoming Classes
              </h2>
              {upcomingClasses.length === 0 ? (
                <p className="text-secondary text-sm">No upcoming classes scheduled.</p>
              ) : (
                <div className="space-y-2">
                  {upcomingClasses.map((cls) => (
                    <div key={cls.id} className="surface-inner p-3 flex justify-between">
                      <div>
                        <p className="text-sm">{cls.ground_school_subjects?.subject_name || 'N/A'}</p>
                        <p className="text-xs text-tertiary">{cls.class_date} {cls.start_time} | {cls.topic || 'No topic'}</p>
                      </div>
                      <span className="badge badge-accent">{cls.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-6 flex flex-wrap gap-4">
              <a
                href="/dashboard/ground-school/schedule"
                className="rounded-lg p-4 transition cursor-pointer no-underline block text-center"
                style={{ backgroundColor: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', color: 'var(--accent)' }}
              >
                <Calendar className="w-5 h-5 mx-auto mb-1" />
                <p className="text-sm font-medium">Schedule Classes</p>
              </a>
              <a
                href="/dashboard/ground-school/attendance"
                className="rounded-lg p-4 transition cursor-pointer no-underline block text-center"
                style={{ backgroundColor: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent-strong) 30%, transparent)', color: 'var(--accent-strong)' }}
              >
                <ClipboardList className="w-5 h-5 mx-auto mb-1" />
                <p className="text-sm font-medium">Attendance &amp; Exams</p>
              </a>
              <a
                href="/dashboard/ground-school/progress"
                className="rounded-lg p-4 transition cursor-pointer no-underline block text-center"
                style={{ backgroundColor: 'var(--success-soft)', border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)', color: 'var(--success)' }}
              >
                <ChartColumn className="w-5 h-5 mx-auto mb-1" />
                <p className="text-sm font-medium">Student Progress</p>
              </a>
            </div>
          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}
