// app/dashboard/student/page.tsx
// Student dashboard – shows personal schedule, logbook, progress, and recent debriefs
// Accessible only to users with role 'student'

'use client';

import { useSession } from 'next-auth/react';
import { useFlightStore } from '@/lib/store';
import { useEffect, useState, useMemo } from 'react';
import Header from '@/components/ui/Header';
import RoleGate from '@/components/ui/RoleGate';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RequirementsChecklist from '@/components/dashboard/RequirementsChecklist';

// ============================================================
// PROGRESS BAR COLOR HELPER
// ============================================================
const getProgressColor = (percent: number): string => {
  if (percent >= 100) return 'bg-green-500';
  if (percent >= 75) return 'bg-blue-500';
  if (percent >= 50) return 'bg-yellow-500';
  if (percent >= 25) return 'bg-orange-500';
  return 'bg-red-500';
};

export default function StudentDashboardPage() {
  const { data: session } = useSession();
  const {
    students, loadStudents,
    scheduledFlights, loadScheduledFlights,
    flightRecords, loadFlightRecords,
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

  // Find the student record
  const student = students.find(s => s.id === studentId);

  // ============================================================
  // FILTER DATA FOR THIS STUDENT
  // ============================================================

  // Upcoming flights (today & future only)
  const now = new Date();
  const myFlights = scheduledFlights
    .filter(f => f.studentId === studentId && new Date(f.startTime) >= now)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  // All logbook entries
  const myLogbook = flightRecords
    .filter(r => r.studentId === studentId)
    .sort((a, b) => new Date(b.flightDate).getTime() - new Date(a.flightDate).getTime());

  // Recent 4 debriefs (flights with instructor notes)
  const recentDebriefs = flightRecords
    .filter(r => r.studentId === studentId && r.instructorNotes?.trim())
    .sort((a, b) => new Date(b.flightDate).getTime() - new Date(a.flightDate).getTime())
    .slice(0, 4);

  // ============================================================
  // CALCULATE PROGRESS
  // ============================================================
  const progress = useMemo(() => {
    const allFlights = flightRecords.filter(f => f.studentId === studentId);
    const totalHours = allFlights.reduce((sum, f) => sum + (f.totalHours || 0), 0);
    const soloFlights = allFlights.filter(f => f.flightType === 'SOLO');
    const soloHours = soloFlights.reduce((sum, f) => sum + (f.totalHours || 0), 0);
    const crossCountryHours = allFlights
      .filter(f => f.sortieType?.includes('CROSS_COUNTRY') || f.sortieType?.includes('NAVIGATION'))
      .reduce((sum, f) => sum + (f.totalHours || 0), 0);
    const instrumentHours = allFlights
      .filter(f => f.sortieType?.includes('INSTRUMENT'))
      .reduce((sum, f) => sum + (f.totalHours || 0), 0);
    const nightHours = allFlights
      .filter(f => f.sortieType?.includes('NIGHT'))
      .reduce((sum, f) => sum + (f.totalHours || 0), 0);
    const totalLandings = allFlights.reduce((sum, f) => sum + (f.landings || 0), 0);

    // Requirements based on training stage
    const isCPL = student?.trainingStage?.includes('CPL');
    const requirements = {
      totalHours: isCPL ? 200 : 40,
      soloHours: isCPL ? 100 : 10,
      crossCountry: isCPL ? 50 : 5,
      instrument: isCPL ? 10 : 3,
      nightHours: isCPL ? 5 : 3,
      landings: isCPL ? 50 : 20,
    };

    return {
      totalFlights: allFlights.length,
      totalHours: Math.round(totalHours * 10) / 10,
      soloHours: Math.round(soloHours * 10) / 10,
      crossCountryHours: Math.round(crossCountryHours * 10) / 10,
      instrumentHours: Math.round(instrumentHours * 10) / 10,
      nightHours: Math.round(nightHours * 10) / 10,
      totalLandings,
      requirements,
      hoursPercent: Math.min(100, Math.round((totalHours / requirements.totalHours) * 100)),
      soloPercent: Math.min(100, Math.round((soloHours / requirements.soloHours) * 100)),
      crossCountryPercent: Math.min(100, Math.round((crossCountryHours / requirements.crossCountry) * 100)),
      instrumentPercent: Math.min(100, Math.round((instrumentHours / requirements.instrument) * 100)),
      nightPercent: Math.min(100, Math.round((nightHours / requirements.nightHours) * 100)),
      landingsPercent: Math.min(100, Math.round((totalLandings / requirements.landings) * 100)),
      overallPercent: 0,
    };
  }, [flightRecords, studentId, student]);

  // Calculate overall progress
  const overallPercent = progress.totalFlights > 0
    ? Math.round(
        (progress.hoursPercent + progress.soloPercent + progress.crossCountryPercent +
         progress.instrumentPercent + progress.nightPercent + progress.landingsPercent) / 6
      )
    : 0;

  // Medical status
  const medicalDate = student?.medicalExpiry ? new Date(student.medicalExpiry) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntilMedical = medicalDate
    ? Math.ceil((medicalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    : null;

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
            
            {/* ============================================================ */}
            {/* STUDENT INFO & MEDICAL BANNER */}
            {/* ============================================================ */}
            {student && (
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center">
                      <span className="text-xl font-bold text-white">{student.initials}</span>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-white">{student.name}</h2>
                      <p className="text-xs text-slate-400">
                        {student.enrollmentId} | {student.trainingStage} | {progress.totalHours}h Total
                      </p>
                    </div>
                  </div>
                  {/* Medical Status */}
                  {medicalDate && (
                    <div className={`px-4 py-2 rounded-lg text-center ${
                      daysUntilMedical !== null && daysUntilMedical < 0
                        ? 'bg-red-500/20 border border-red-500/30'
                        : daysUntilMedical !== null && daysUntilMedical <= 30
                        ? 'bg-yellow-500/20 border border-yellow-500/30'
                        : 'bg-green-500/20 border border-green-500/30'
                    }`}>
                      <p className={`text-sm font-bold ${
                        daysUntilMedical !== null && daysUntilMedical < 0
                          ? 'text-red-400'
                          : daysUntilMedical !== null && daysUntilMedical <= 30
                          ? 'text-yellow-400'
                          : 'text-green-400'
                      }`}>
                        🏥 Medical: {student.medicalExpiry}
                      </p>
                      {daysUntilMedical !== null && daysUntilMedical < 0 && (
                        <p className="text-xs text-red-400 mt-1">⚠ EXPIRED - Grounded until renewed!</p>
                      )}
                      {daysUntilMedical !== null && daysUntilMedical > 0 && daysUntilMedical <= 30 && (
                        <p className="text-xs text-yellow-400 mt-1">⚠ {daysUntilMedical} days remaining</p>
                      )}
                      {daysUntilMedical !== null && daysUntilMedical > 30 && (
                        <p className="text-xs text-green-400 mt-1">✅ Valid</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ===== FIRST SOLO CELEBRATION BANNER ===== */}
            {student?.firstSoloDate && (
              <div className="bg-gradient-to-r from-yellow-500/20 via-amber-500/10 to-yellow-500/20 border border-yellow-500/30 rounded-xl p-6 mb-6 text-center">
                <p className="text-4xl mb-3">🎉</p>
                <p className="text-xl font-bold text-yellow-400">Congratulations on Your First Solo!</p>
                <p className="text-sm text-yellow-300/80 mt-2">
                  A major milestone achieved on{' '}
                  <span className="font-bold text-yellow-400">
                    {new Date(student.firstSoloDate).toLocaleDateString('en-IN', { 
                      weekday: 'long', 
                      day: 'numeric', 
                      month: 'long', 
                      year: 'numeric' 
                    })}
                  </span>
                </p>
                <p className="text-xs text-yellow-200/50 mt-2">This is where every pilot's journey truly begins! ✈️</p>
              </div>
            )}

            {/* ============================================================ */}
            {/* OVERALL PROGRESS BAR */}
            {/* ============================================================ */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">📈 My Progress</h3>
              <div className="flex items-center space-x-4 mb-4">
                <div className="flex-1 bg-slate-700 rounded-full h-4">
                  <div
                    className={`h-4 rounded-full transition-all duration-500 ${getProgressColor(overallPercent)}`}
                    style={{ width: `${overallPercent}%` }}
                  />
                </div>
                <span className="text-white font-bold text-lg">{overallPercent}%</span>
              </div>
              <p className="text-xs text-slate-400">
                {progress.totalHours}h / {progress.requirements.totalHours}h required for {student?.trainingStage || 'license'}
              </p>
            </div>

            {/* ============================================================ */}
            {/* PROGRESS BREAKDOWN CARDS */}
            {/* ============================================================ */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              {[
                { label: 'Total Hours', value: `${progress.totalHours}h`, target: `${progress.requirements.totalHours}h`, percent: progress.hoursPercent },
                { label: 'Solo Hours', value: `${progress.soloHours}h`, target: `${progress.requirements.soloHours}h`, percent: progress.soloPercent },
                { label: 'Cross Country', value: `${progress.crossCountryHours}h`, target: `${progress.requirements.crossCountry}h`, percent: progress.crossCountryPercent },
                { label: 'Instrument', value: `${progress.instrumentHours}h`, target: `${progress.requirements.instrument}h`, percent: progress.instrumentPercent },
                { label: 'Night Hours', value: `${progress.nightHours}h`, target: `${progress.requirements.nightHours}h`, percent: progress.nightPercent },
                { label: 'Landings', value: progress.totalLandings.toString(), target: progress.requirements.landings.toString(), percent: progress.landingsPercent },
              ].map((item, i) => (
                <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                  <p className="text-xs text-slate-400 mb-2">{item.label}</p>
                  <p className="text-lg font-bold text-white">{item.value}</p>
                  <p className="text-xs text-slate-500 mb-2">Target: {item.target}</p>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div className={`h-2 rounded-full ${getProgressColor(item.percent)}`} style={{ width: `${item.percent}%` }} />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{item.percent}%</p>
                </div>
              ))}
            </div>
            {/* ============================================================ */}
            {/* STUDENT REQUIREMENTS CHECKLIST */}
            {/* ============================================================ */}
            {studentId && (
              <div className="mb-6">
                <RequirementsChecklist studentId={studentId} />
              </div>
            )}
            {/* ============================================================ */}
            {/* TWO COLUMN: UPCOMING FLIGHTS + RECENT DEBRIEFS */}
            {/* ============================================================ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              
              {/* ----- UPCOMING FLIGHTS ----- */}
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">📅 My Upcoming Flights</h2>
                {myFlights.length === 0 ? (
                  <p className="text-slate-400 text-sm">No upcoming flights scheduled.</p>
                ) : (
                  <div className="space-y-2">
                    {myFlights.slice(0, 5).map(flight => (
                      <div key={flight.id} className="bg-slate-900/50 rounded-lg p-3 flex justify-between items-center">
                        <div>
                          <p className="text-white text-sm font-medium">
                            {new Date(flight.startTime).toLocaleDateString('en-IN')}{' '}
                            {new Date(flight.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-slate-400 text-xs">
                            {flight.sortieType?.replace(/_/g, ' ')} — {flight.aircraftReg} | {flight.instructorName}
                          </p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          flight.status === 'SCHEDULED' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
                        }`}>
                          {flight.status?.replace('_', ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ----- RECENT DEBRIEFS ----- */}
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">📝 Recent Instructor Debriefs</h2>
                {recentDebriefs.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-slate-400 text-sm">No debriefs yet. Complete a flight with your instructor!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentDebriefs.map((record, i) => (
                      <div key={i} className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="text-white text-sm font-medium">
                              {new Date(record.flightDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </p>
                            <p className="text-xs text-slate-400">
                              {record.sortieType?.replace(/_/g, ' ')} | {record.aircraftReg} | {record.totalHours}h
                            </p>
                          </div>
                          <span className="text-sm">
                            {'⭐'.repeat(record.studentPerformance || 0)}
                            {'☆'.repeat(5 - (record.studentPerformance || 0))}
                          </span>
                        </div>
                        {/* Instructor Notes */}
                        <div className="bg-slate-800/50 rounded p-2 mt-2">
                          <p className="text-xs text-slate-500 mb-1">Instructor: {record.instructorName}</p>
                          <p className="text-sm text-slate-300 italic">"{record.instructorNotes}"</p>
                        </div>
                        {/* Maneuvers */}
                        {record.maneuvers && (
                          <div className="mt-2">
                            <p className="text-xs text-slate-500">Maneuvers: <span className="text-slate-400">{record.maneuvers}</span></p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ============================================================ */}
            {/* RECENT LOGBOOK */}
            {/* ============================================================ */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">📋 Recent Logbook</h2>
                <a href="/dashboard/flights" className="text-sm text-blue-400 hover:text-blue-300">View All →</a>
              </div>
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
                        <th className="pb-2">Type</th>
                        <th className="pb-2">Hours</th>
                        <th className="pb-2">Landings</th>
                        <th className="pb-2">Instructor</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      {myLogbook.slice(0, 5).map(record => (
                        <tr key={record.id} className="border-b border-slate-700/50">
                          <td className="py-2 text-white">{new Date(record.flightDate).toLocaleDateString('en-IN')}</td>
                          <td className="py-2">{record.sortieType?.replace(/_/g, ' ')}</td>
                          <td className="py-2">{record.aircraftReg}</td>
                          <td className="py-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              record.flightType === 'SOLO' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
                            }`}>{record.flightType}</span>
                          </td>
                          <td className="py-2 text-green-400">{record.totalHours}h</td>
                          <td className="py-2">{record.landings}</td>
                          <td className="py-2">{record.instructorName}</td>
                        </tr>
                      ))}
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