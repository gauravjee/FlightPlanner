// app/dashboard/student/page.tsx
// Student dashboard – shows personal schedule and logbook
// Accessible only to users with role 'student'

'use client';

import { useSession } from 'next-auth/react';
import { useFlightStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import Header from '@/components/ui/Header';
import RoleGate from '@/components/ui/RoleGate';
import ProtectedRoute from '@/components/ui/ProtectedRoute';

export default function StudentDashboardPage() {
  const { data: session } = useSession();
  const {
    students,
    loadStudents,
    scheduledFlights,
    loadScheduledFlights,
    flightRecords,
    loadFlightRecords,
  } = useFlightStore();

  const [studentId, setStudentId] = useState<string | null>(null);

  // Extract studentId from session and load data
  useEffect(() => {
    if (session?.user) {
      const sid = (session.user as any).studentId;
      if (sid) {
        setStudentId(sid);
        loadStudents();
        loadScheduledFlights();
        loadFlightRecords();
      }
    }
  }, [session, loadStudents, loadScheduledFlights, loadFlightRecords]);

  // Find the student record to show name and total hours
  const student = students.find(s => s.id === studentId);

  // Filter flights and logbook for this student only
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const myFlights = scheduledFlights
    .filter(f => f.studentId === studentId && new Date(f.startTime) >= todayStart)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const myLogbook = flightRecords.filter(r => r.studentId === studentId).slice(0, 10);

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={['student']}>
        <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
          <Header
            title="Student Dashboard"
            subtitle={student ? `Welcome, ${student.name}` : 'Loading...'}
            backUrl="/"
          />

          <div className="max-w-7xl mx-auto px-4 py-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                <p className="text-xs text-slate-400">Total Hours</p>
                <p className="text-2xl font-bold text-blue-400">
                  {student?.totalHours || 0}h
                </p>
              </div>
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                <p className="text-xs text-slate-400">Upcoming Flights</p>
                <p className="text-2xl font-bold text-green-400">
                  {myFlights.length}
                </p>
              </div>
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
                <p className="text-xs text-slate-400">Logbook Entries</p>
                <p className="text-2xl font-bold text-purple-400">
                  {myLogbook.length}
                </p>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                <p className="text-xs text-slate-400">Medical Expiry</p>
                <p className="text-2xl font-bold text-yellow-400">
                  {student?.medicalExpiry || 'N/A'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Upcoming Schedule */}
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">
                  📅 My Upcoming Flights
                </h2>
                {myFlights.length === 0 ? (
                  <p className="text-slate-400 text-sm">No upcoming flights scheduled.</p>
                ) : (
                  <div className="space-y-2">
                    {myFlights.map(flight => (
                      <div
                        key={flight.id}
                        className="bg-slate-900/50 rounded-lg p-3 flex justify-between items-center"
                      >
                        <div>
                          <p className="text-white text-sm font-medium">
                            {new Date(flight.startTime).toLocaleDateString('en-IN')}{' '}
                            {new Date(flight.startTime).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                          <p className="text-slate-400 text-xs">
                            {flight.sortieType?.replace(/_/g, ' ')} - {flight.aircraftReg}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            flight.status === 'SCHEDULED'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-green-500/20 text-green-400'
                          }`}
                        >
                          {flight.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Logbook */}
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">
                  📝 Recent Logbook
                </h2>
                {myLogbook.length === 0 ? (
                  <p className="text-slate-400 text-sm">No flight records yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-400 border-b border-slate-700">
                          <th className="pb-2">Date</th>
                          <th className="pb-2">Sortie</th>
                          <th className="pb-2">Aircraft</th>
                          <th className="pb-2">Hours</th>
                          <th className="pb-2">Landings</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-300">
                        {myLogbook.map(record => (
                          <tr key={record.id} className="border-b border-slate-700/50">
                            <td className="py-2 text-white">
                              {new Date(record.flightDate).toLocaleDateString('en-IN')}
                            </td>
                            <td className="py-2">
                              {record.sortieType?.replace(/_/g, ' ')}
                            </td>
                            <td className="py-2">{record.aircraftReg}</td>
                            <td className="py-2 text-green-400">{record.totalHours}</td>
                            <td className="py-2">{record.landings}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}