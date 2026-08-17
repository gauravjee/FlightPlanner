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
import {
  HeartPulse, TriangleAlert, CircleCheck, PartyPopper, Plane,
  TrendingUp, Calendar, NotebookPen, ClipboardList, Star,
} from 'lucide-react';

// ============================================================
// PROGRESS BAR COLOR HELPER
// ============================================================
const getProgressColor = (percent: number): string => {
  if (percent >= 100) return 'var(--success)';
  if (percent >= 75) return 'var(--accent)';
  if (percent >= 50) return 'var(--warning)';
  if (percent >= 25) return 'var(--warning-text)';
  return 'var(--danger)';
};

export default function StudentDashboardPage() {
  const { data: session } = useSession();
  const {
    students, loadStudents,
    scheduledFlights, loadScheduledFlights,
    flightRecords, loadFlightRecords,
  } = useFlightStore();

  const [studentId, setStudentId] = useState<string | null>(null);
  // "View All" used to link to /dashboard/flights — the staff logbook page,
  // which is RoleGated to admin/instructor/super_admin and 404s (now:
  // redirects to /unauthorized) for a student. That page also shows every
  // student's records with staff-only actions (log flight, export, filter
  // by student), so adding 'student' to its RoleGate isn't the right fix
  // either. myLogbook below already holds this student's complete history
  // client-side, so "View All" just expands it in place instead.
  const [showAllLogbook, setShowAllLogbook] = useState(false);

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
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
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
              <div className="surface-card p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 surface-inner rounded-full flex items-center justify-center">
                      <span className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{student.initials}</span>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{student.name}</h2>
                      <p className="text-xs text-tertiary">
                        {student.enrollmentId} | {student.trainingStage} | {progress.totalHours}h Total
                      </p>
                    </div>
                  </div>
                  {/* Medical Status */}
                  {medicalDate && (
                    <div
                      className="px-4 py-2 rounded-lg text-center"
                      style={
                        daysUntilMedical !== null && daysUntilMedical < 0
                          ? { backgroundColor: 'var(--danger-soft)', border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)' }
                          : daysUntilMedical !== null && daysUntilMedical <= 30
                          ? { backgroundColor: 'var(--warning-soft)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)' }
                          : { backgroundColor: 'var(--success-soft)', border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)' }
                      }
                    >
                      <p
                        className="text-sm font-bold flex items-center gap-1.5 justify-center"
                        style={{
                          color:
                            daysUntilMedical !== null && daysUntilMedical < 0
                              ? 'var(--danger)'
                              : daysUntilMedical !== null && daysUntilMedical <= 30
                              ? 'var(--warning-text)'
                              : 'var(--success)',
                        }}
                      >
                        <HeartPulse className="w-3.5 h-3.5" /> Medical: {student.medicalExpiry}
                      </p>
                      {daysUntilMedical !== null && daysUntilMedical < 0 && (
                        <p className="text-xs mt-1 flex items-center gap-1 justify-center" style={{ color: 'var(--danger)' }}><TriangleAlert className="w-3 h-3" /> EXPIRED - Grounded until renewed!</p>
                      )}
                      {daysUntilMedical !== null && daysUntilMedical > 0 && daysUntilMedical <= 30 && (
                        <p className="text-xs mt-1 flex items-center gap-1 justify-center" style={{ color: 'var(--warning-text)' }}><TriangleAlert className="w-3 h-3" /> {daysUntilMedical} days remaining</p>
                      )}
                      {daysUntilMedical !== null && daysUntilMedical > 30 && (
                        <p className="text-xs mt-1 flex items-center gap-1 justify-center" style={{ color: 'var(--success)' }}><CircleCheck className="w-3 h-3" /> Valid</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ===== FIRST SOLO CELEBRATION BANNER ===== */}
            {student?.firstSoloDate && (
              <div className="rounded-xl p-6 mb-6 text-center" style={{ backgroundImage: 'linear-gradient(90deg, color-mix(in srgb, var(--warning) 20%, transparent), color-mix(in srgb, var(--warning) 10%, transparent), color-mix(in srgb, var(--warning) 20%, transparent))', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)' }}>
                <PartyPopper className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--warning-text)' }} />
                <p className="text-xl font-bold" style={{ color: 'var(--warning-text)' }}>Congratulations on Your First Solo!</p>
                <p className="text-sm mt-2" style={{ color: 'var(--warning-text)' }}>
                  A major milestone achieved on{' '}
                  <span className="font-bold">
                    {new Date(student.firstSoloDate).toLocaleDateString('en-IN', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </span>
                </p>
                <p className="text-xs mt-2 flex items-center gap-1 justify-center" style={{ color: 'var(--warning-text)', opacity: 0.7 }}>
                  This is where every pilot's journey truly begins! <Plane className="w-3.5 h-3.5" />
                </p>
              </div>
            )}

            {/* ============================================================ */}
            {/* OVERALL PROGRESS BAR */}
            {/* ============================================================ */}
            <div className="surface-card p-6 mb-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-secondary" /> My Progress
              </h3>
              <div className="flex items-center space-x-4 mb-4">
                <div className="flex-1 surface-inner rounded-full h-4">
                  <div
                    className="h-4 rounded-full transition-all duration-500"
                    style={{ width: `${overallPercent}%`, backgroundColor: getProgressColor(overallPercent) }}
                  />
                </div>
                <span className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{overallPercent}%</span>
              </div>
              <p className="text-xs text-tertiary">
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
                <div key={i} className="surface-card p-4">
                  <p className="text-xs text-tertiary mb-2">{item.label}</p>
                  <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{item.value}</p>
                  <p className="text-xs text-tertiary mb-2">Target: {item.target}</p>
                  <div className="w-full surface-inner rounded-full h-2">
                    <div className="h-2 rounded-full" style={{ width: `${item.percent}%`, backgroundColor: getProgressColor(item.percent) }} />
                  </div>
                  <p className="text-xs text-tertiary mt-1">{item.percent}%</p>
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
              <div className="surface-card backdrop-blur-sm p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-secondary" /> My Upcoming Flights
                </h2>
                {myFlights.length === 0 ? (
                  <p className="text-secondary text-sm">No upcoming flights scheduled.</p>
                ) : (
                  <div className="space-y-2">
                    {myFlights.slice(0, 5).map(flight => (
                      <div key={flight.id} className="surface-inner p-3 flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {new Date(flight.startTime).toLocaleDateString('en-IN')}{' '}
                            {new Date(flight.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-tertiary text-xs">
                            {flight.sortieType?.replace(/_/g, ' ')} — {flight.aircraftReg} | {flight.instructorName}
                          </p>
                        </div>
                        <span className={`badge ${flight.status === 'SCHEDULED' ? 'badge-accent' : 'badge-success'}`}>
                          {flight.status?.replace('_', ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ----- RECENT DEBRIEFS ----- */}
              <div className="surface-card backdrop-blur-sm p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <NotebookPen className="w-4 h-4 text-secondary" /> Recent Instructor Debriefs
                </h2>
                {recentDebriefs.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-secondary text-sm">No debriefs yet. Complete a flight with your instructor!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentDebriefs.map((record, i) => (
                      <div key={i} className="surface-inner p-4">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                              {new Date(record.flightDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </p>
                            <p className="text-xs text-tertiary">
                              {record.sortieType?.replace(/_/g, ' ')} | {record.aircraftReg} | {record.totalHours}h
                            </p>
                          </div>
                          <span className="text-sm flex items-center gap-1" style={{ color: 'var(--warning-text)' }}>
                            <Star className="w-3.5 h-3.5" /> {record.studentPerformance || 0}/5
                          </span>
                        </div>
                        {/* Instructor Notes */}
                        <div className="surface-muted rounded p-2 mt-2">
                          <p className="text-xs text-tertiary mb-1">Instructor: {record.instructorName}</p>
                          <p className="text-sm text-secondary italic">"{record.instructorNotes}"</p>
                        </div>
                        {/* Maneuvers */}
                        {record.maneuvers && (
                          <div className="mt-2">
                            <p className="text-xs text-tertiary">Maneuvers: <span className="text-secondary">{record.maneuvers}</span></p>
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
            <div className="surface-card backdrop-blur-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-secondary" /> Recent Logbook
                </h2>
                {myLogbook.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllLogbook(prev => !prev)}
                    className="text-sm cursor-pointer transition"
                    style={{ color: 'var(--accent)' }}
                  >
                    {showAllLogbook ? '← Show Less' : 'View All →'}
                  </button>
                )}
              </div>
              {myLogbook.length === 0 ? (
                <p className="text-secondary text-sm">No flight records yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                        <th className="pb-2">Date</th>
                        <th className="pb-2">Sortie</th>
                        <th className="pb-2">Aircraft</th>
                        <th className="pb-2">Type</th>
                        <th className="pb-2">Hours</th>
                        <th className="pb-2">Landings</th>
                        <th className="pb-2">Instructor</th>
                      </tr>
                    </thead>
                    <tbody className="text-secondary">
                      {(showAllLogbook ? myLogbook : myLogbook.slice(0, 5)).map(record => (
                        <tr key={record.id} className="border-b" style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
                          <td className="py-2" style={{ color: 'var(--text-primary)' }}>{new Date(record.flightDate).toLocaleDateString('en-IN')}</td>
                          <td className="py-2">{record.sortieType?.replace(/_/g, ' ')}</td>
                          <td className="py-2">{record.aircraftReg}</td>
                          <td className="py-2">
                            <span className={`badge ${record.flightType === 'SOLO' ? 'badge-success' : 'badge-accent'}`}>{record.flightType}</span>
                          </td>
                          <td className="py-2" style={{ color: 'var(--success)' }}>{record.totalHours}h</td>
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
