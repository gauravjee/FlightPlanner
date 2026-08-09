// app/dashboard/instructor/page.tsx
// Instructor Dashboard - Personalized teaching view
// ============================================================
// Features:
//   - My Today's Schedule (flights assigned to this instructor)
//   - My Students (students assigned to this instructor)
//   - Recent Debriefs (last 5 completed flights with notes)
//   - Student Progress Overview (progress bars for assigned students)
//   - Quick Stats (total students, flights today, hours this week)
//   - Upcoming Availability (leave/schedule overview)
// ============================================================

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useFlightStore } from '@/lib/store';
import Header from '@/components/ui/Header';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import Link from 'next/link';

export default function InstructorDashboardPage() {
  const { data: session } = useSession();
  const instructorName = session?.user?.name || 'Instructor';
  const instructorEmail = session?.user?.email || '';
  // ============================================================
  // STORE DATA
  // ============================================================
  const {
    instructors, loadInstructors,
    students, loadStudents,
    scheduledFlights, loadScheduledFlights,
    flightRecords, loadFlightRecords,
    trainingRequirements, loadTrainingRequirements,
  } = useFlightStore();
  
  // Find the instructor's database ID from their email
  const [instructorId, setInstructorId] = useState('');
  
  useEffect(() => {
    if (instructorEmail && instructors.length > 0) {
      const inst = instructors.find(i => i.email === instructorEmail);
      if (inst) {
        setInstructorId(inst.id);
      }
    }
  }, [instructorEmail, instructors]);



  // Load all data on mount
  useEffect(() => {
    loadInstructors();
    loadStudents();
    loadScheduledFlights();
    loadFlightRecords();
    loadTrainingRequirements();
  }, []);

  // ============================================================
  // DERIVED DATA
  // ============================================================

  // Today's date in local time
  const todayStr = new Date().toLocaleDateString('en-CA');

  // Flights assigned to THIS instructor
  const myFlights = useMemo(() => {
    return scheduledFlights.filter(f => f.instructorId === instructorId);
  }, [scheduledFlights, instructorId]);

  // Today's flights for this instructor
  const todayFlights = useMemo(() => {
    return myFlights.filter(f => {
      const flightDate = new Date(f.startTime).toLocaleDateString('en-CA');
      return flightDate === todayStr;
    }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [myFlights, todayStr]);

  // Upcoming flights (today + future)
  const upcomingFlights = useMemo(() => {
    const now = new Date();
    return myFlights
      .filter(f => new Date(f.startTime) >= now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, 10);
  }, [myFlights]);

  // Students FORMALLY ASSIGNED to this instructor (via assigned_instructor_id)
  const myStudents = useMemo(() => {
    return students.filter(s => s.assignedInstructorId === instructorId);
  }, [students, instructorId]);

  // Recent debriefs (completed flights with instructor notes)
  const recentDebriefs = useMemo(() => {
    return flightRecords
      .filter(f => f.instructorId === instructorId && f.instructorNotes?.trim())
      .sort((a, b) => new Date(b.flightDate).getTime() - new Date(a.flightDate).getTime())
      .slice(0, 5);
  }, [flightRecords, instructorId]);

  // Stats
  const stats = useMemo(() => {
    const totalStudents = myStudents.length;
    const flightsToday = todayFlights.length;
    
    // Hours this week
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const hoursThisWeek = flightRecords
      .filter(f => f.instructorId === instructorId && new Date(f.flightDate) >= weekStart)
      .reduce((sum, f) => sum + (f.totalHours || 0), 0);

    return { totalStudents, flightsToday, hoursThisWeek: Math.round(hoursThisWeek * 10) / 10 };
  }, [myStudents, todayFlights, flightRecords, instructorId]);

  // Student progress data
  const studentProgressList = useMemo(() => {
    return myStudents.map(student => {
      const studentFlights = flightRecords.filter(f => f.studentId === student.id);
      const totalHours = studentFlights.reduce((sum, f) => sum + (f.totalHours || 0), 0);
      const isPPL = student.trainingStage?.includes('PPL');
      const targetHours = isPPL ? 40 : 200;
      const progressPercent = Math.min(100, Math.round((totalHours / targetHours) * 100));
      
      // Get requirements completion
      const studentReqs = trainingRequirements.filter(r => r.studentId === student.id);
      const completedReqs = studentReqs.filter(r => r.isCompleted).length;
      const totalReqs = studentReqs.length || 1;

      return {
        student,
        totalHours: Math.round(totalHours * 10) / 10,
        targetHours,
        progressPercent,
        completedReqs,
        totalReqs,
        reqPercent: Math.round((completedReqs / totalReqs) * 100),
      };
    }).sort((a, b) => b.progressPercent - a.progressPercent);
  }, [myStudents, flightRecords, trainingRequirements]);

  // ============================================================
  // HELPER: Progress bar color
  // ============================================================
  const getProgressColor = (percent: number): string => {
    if (percent >= 100) return 'bg-green-500';
    if (percent >= 75) return 'bg-blue-500';
    if (percent >= 50) return 'bg-yellow-500';
    if (percent >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={['instructor', 'admin', 'super_admin']}>
        <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
          <Header
            title="Instructor Dashboard"
            subtitle={`Welcome, ${instructorName}`}
            backUrl="/dashboard"
          />

          <div className="max-w-7xl mx-auto px-4 py-6">

            {/* ============================================================ */}
            {/* QUICK STATS */}
            {/* ============================================================ */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'My Students', value: stats.totalStudents, color: 'text-blue-400' },
                { label: "Today's Flights", value: stats.flightsToday, color: 'text-green-400' },
                { label: 'Hours This Week', value: `${stats.hoursThisWeek}h`, color: 'text-purple-400' },
                { label: 'Upcoming Flights', value: upcomingFlights.length, color: 'text-yellow-400' },
              ].map((stat, i) => (
                <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                  <p className="text-xs text-slate-400">{stat.label}</p>
                  <p className={`text-2xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
                </div>
              ))}
            </div>

            {/* ============================================================ */}
            {/* TWO COLUMN LAYOUT */}
            {/* ============================================================ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

              {/* ----- TODAY'S SCHEDULE ----- */}
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">📅 My Today's Schedule</h2>
                {todayFlights.length === 0 ? (
                  <p className="text-slate-400 text-sm">No flights scheduled for today.</p>
                ) : (
                  <div className="space-y-2">
                    {todayFlights.map(flight => {
                      const student = students.find(s => s.id === flight.studentId);
                      return (
                        <div key={flight.id} className="bg-slate-900/50 rounded-lg p-3 flex justify-between items-center">
                          <div>
                            <p className="text-white text-sm font-medium">
                              {new Date(flight.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} - 
                              {new Date(flight.endTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <p className="text-slate-400 text-xs">
                              {student?.name || 'No Student'} ({student?.initials || '—'}) | {flight.aircraftReg}
                            </p>
                            <p className="text-slate-500 text-xs">
                              {(flight as any).exercise || flight.sortieType}
                            </p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            flight.status === 'IN_PROGRESS' ? 'bg-green-500/20 text-green-400' :
                            flight.status === 'SCHEDULED' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>
                            {flight.status?.replace('_', ' ')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ----- RECENT DEBRIEFS ----- */}
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">📝 Recent Debriefs</h2>
                {recentDebriefs.length === 0 ? (
                  <p className="text-slate-400 text-sm">No recent debriefs.</p>
                ) : (
                  <div className="space-y-3">
                    {recentDebriefs.map(record => (
                      <div key={record.id} className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                        <div className="flex justify-between mb-1">
                          <span className="text-white text-sm font-medium">{record.studentName}</span>
                          <span className="text-xs text-slate-400">
                            {new Date(record.flightDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mb-1">
                          {(record as any).exercise || record.sortieType} | {record.totalHours}h | ⭐{record.studentPerformance}/5
                        </p>
                        <p className="text-xs text-slate-300 italic">"{record.instructorNotes}"</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ============================================================ */}
            {/* MY STUDENTS & PROGRESS */}
            {/* ============================================================ */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">👨‍✈️ My Students</h2>
                <Link href="/dashboard/progress" className="text-sm text-blue-400 hover:text-blue-300">
                  View All Progress →
                </Link>
              </div>

              {studentProgressList.length === 0 ? (
                <p className="text-slate-400 text-sm">No students assigned yet.</p>
              ) : (
                <div className="space-y-3">
                  {studentProgressList.slice(0, 8).map(item => (
                    <div key={item.student.id} className="bg-slate-900/50 rounded-lg p-3 flex items-center space-x-4">
                      {/* Student Info */}
                      <div className="w-32 flex-shrink-0">
                        <p className="text-sm font-medium text-white truncate">{item.student.name}</p>
                        <p className="text-xs text-slate-500">{item.student.initials} | {item.student.trainingStage}</p>
                      </div>
                      {/* Hours Progress */}
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-400">Hours</span>
                          <span className="text-xs text-slate-400">{item.totalHours}h / {item.targetHours}h ({item.progressPercent}%)</span>
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-2">
                          <div className={`h-2 rounded-full ${getProgressColor(item.progressPercent)}`} style={{ width: `${item.progressPercent}%` }} />
                        </div>
                      </div>
                      {/* Requirements Progress */}
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-400">Requirements</span>
                          <span className="text-xs text-slate-400">{item.completedReqs}/{item.totalReqs} ({item.reqPercent}%)</span>
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-2">
                          <div className={`h-2 rounded-full ${getProgressColor(item.reqPercent)}`} style={{ width: `${item.reqPercent}%` }} />
                        </div>
                      </div>
                      {/* Quick Link */}
                      <Link
                        href={`/dashboard/progress`}
                        className="text-xs text-blue-400 hover:text-blue-300 flex-shrink-0"
                      >
                        Details →
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ============================================================ */}
            {/* UPCOMING FLIGHTS */}
            {/* ============================================================ */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">🔜 Upcoming Flights</h2>
              {upcomingFlights.length === 0 ? (
                <p className="text-slate-400 text-sm">No upcoming flights scheduled.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-700">
                        <th className="pb-2">Date</th>
                        <th className="pb-2">Time</th>
                        <th className="pb-2">Student</th>
                        <th className="pb-2">Aircraft</th>
                        <th className="pb-2">Exercise</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      {upcomingFlights.map(flight => {
                        const student = students.find(s => s.id === flight.studentId);
                        return (
                          <tr key={flight.id} className="border-b border-slate-700/50">
                            <td className="py-2 text-white text-xs">
                              {new Date(flight.startTime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            </td>
                            <td className="py-2 text-xs">
                              {new Date(flight.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="py-2 text-xs">{student?.name || '—'}</td>
                            <td className="py-2 text-xs">{flight.aircraftReg}</td>
                            <td className="py-2 text-xs">{(flight as any).exercise || flight.sortieType}</td>
                            <td className="py-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs ${
                                flight.status === 'SCHEDULED' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
                              }`}>
                                {flight.status?.replace('_', ' ')}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}