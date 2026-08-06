// app/dashboard/progress/page.tsx
// Student Progress Tracking Page
// Admin & Instructors see all students, Students see only their own progress
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useFlightStore } from '@/lib/store';
import { StudentRecord, FlightRecord } from '@/types';
import Header from '@/components/ui/Header';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RequirementsChecklist from '@/components/dashboard/RequirementsChecklist';

// ============================================================
// TRAINING STAGE REQUIREMENTS (DGCA/CAA typical minimums)
// ============================================================
const PPL_REQUIREMENTS = {
  totalHours: 40,
  soloHours: 10,
  crossCountry: 5,
  instrument: 3,
  nightHours: 3,
  landings: 20,
};

const CPL_REQUIREMENTS = {
  totalHours: 200,
  soloHours: 100,
  crossCountry: 50,
  instrument: 10,
  nightHours: 5,
  landings: 50,
};

// ============================================================
// COLOR HELPERS
// ============================================================
const getProgressColor = (percent: number): string => {
  if (percent >= 100) return 'bg-green-500';
  if (percent >= 75) return 'bg-blue-500';
  if (percent >= 50) return 'bg-yellow-500';
  if (percent >= 25) return 'bg-orange-500';
  return 'bg-red-500';
};

const getStageColor = (stage: string): string => {
  if (stage?.includes('PPL')) return 'text-blue-400';
  if (stage?.includes('CPL')) return 'text-purple-400';
  if (stage?.includes('IR')) return 'text-cyan-400';
  return 'text-slate-400';
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function ProgressPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role;
  const userStudentId = (session?.user as any)?.studentId;

  const {
    students, loadStudents,
    flightRecords, loadFlightRecords,
    instructors
  } = useFlightStore();

  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedStage, setSelectedStage] = useState<string>('ALL');

  // Load data on mount
  useEffect(() => {
    loadStudents();
    loadFlightRecords();
  }, [loadStudents, loadFlightRecords]);

  // If student is logged in, auto-select their own record
  useEffect(() => {
    if (userRole === 'student' && userStudentId) {
      setSelectedStudentId(userStudentId);
    }
  }, [userRole, userStudentId]);

  // Filter students based on role
  const visibleStudents = useMemo(() => {
    if (userRole === 'student' && userStudentId) {
      return students.filter(s => s.id === userStudentId);
    }
    return students.filter(s => {
      const matchesStage = selectedStage === 'ALL' || s.trainingStage === selectedStage;
      return matchesStage;
    });
  }, [students, userRole, userStudentId, selectedStage]);

  // Get selected student object
  const selectedStudent = students.find(s => s.id === selectedStudentId);

  // Get flights for selected student
  const studentFlights = useMemo(() => {
    if (!selectedStudentId) return [];
    return flightRecords.filter(f => f.studentId === selectedStudentId);
  }, [flightRecords, selectedStudentId]);

  // Calculate statistics
  const stats = useMemo(() => {
    const flights = studentFlights;
    
    const totalHours = flights.reduce((sum, f) => sum + (f.totalHours || 0), 0);
    const soloFlights = flights.filter(f => f.flightType === 'SOLO');
    const soloHours = soloFlights.reduce((sum, f) => sum + (f.totalHours || 0), 0);
    const dualHours = totalHours - soloHours;
    const crossCountryFlights = flights.filter(f => 
      f.sortieType?.includes('CROSS_COUNTRY') || f.sortieType?.includes('NAVIGATION')
    );
    const crossCountryHours = crossCountryFlights.reduce((sum, f) => sum + (f.totalHours || 0), 0);
    const instrumentFlights = flights.filter(f => f.sortieType?.includes('INSTRUMENT'));
    const instrumentHours = instrumentFlights.reduce((sum, f) => sum + (f.totalHours || 0), 0);
    const nightFlights = flights.filter(f => f.sortieType?.includes('NIGHT'));
    const nightHours = nightFlights.reduce((sum, f) => sum + (f.totalHours || 0), 0);
    const totalLandings = flights.reduce((sum, f) => sum + (f.landings || 0), 0);
    
    // Determine which requirements to use
    const requirements = selectedStudent?.trainingStage?.includes('CPL') 
      ? CPL_REQUIREMENTS 
      : PPL_REQUIREMENTS;

    return {
      totalFlights: flights.length,
      totalHours: Math.round(totalHours * 10) / 10,
      soloHours: Math.round(soloHours * 10) / 10,
      dualHours: Math.round(dualHours * 10) / 10,
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
  }, [studentFlights, selectedStudent]);

  // Calculate overall progress
  const overallPercent = stats.totalFlights > 0
    ? Math.round(
        (stats.hoursPercent + stats.soloPercent + stats.crossCountryPercent + 
         stats.instrumentPercent + stats.nightPercent + stats.landingsPercent) / 6
      )
    : 0;

  // Recent flights (last 5)
  const recentFlights = studentFlights
    .sort((a, b) => new Date(b.flightDate).getTime() - new Date(a.flightDate).getTime())
    .slice(0, 5);

  // Hours trend (last 30 days by date)
  const hoursByDate = useMemo(() => {
    const map = new Map<string, number>();
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      map.set(d.toLocaleDateString('en-CA'), 0);
    }
    studentFlights.forEach(f => {
      const date = new Date(f.flightDate).toLocaleDateString('en-CA');
      if (map.has(date)) {
        map.set(date, (map.get(date) || 0) + (f.totalHours || 0));
      }
    });
    return Array.from(map.entries()).map(([date, hours]) => ({
      date: new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      hours: Math.round(hours * 10) / 10,
    }));
  }, [studentFlights]);

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <Header title="Student Progress" subtitle="Track training progress and achievements" />

        <div className="max-w-7xl mx-auto px-4 py-6">
          
          {/* Student Selector (only for admin/instructor) */}
          {userRole !== 'student' && (
            <div className="flex flex-col md:flex-row gap-3 mb-6">
              <select
                value={selectedStudentId}
                onChange={e => setSelectedStudentId(e.target.value)}
                className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white"
              >
                <option value="">Select a student to view progress</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.initials}) — {s.trainingStage} | {s.totalHours}h
                  </option>
                ))}
              </select>
              <select
                value={selectedStage}
                onChange={e => setSelectedStage(e.target.value)}
                className="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white"
              >
                <option value="ALL">All Stages</option>
                <option value="PPL">PPL</option>
                <option value="CPL">CPL</option>
                <option value="IR">IR</option>
              </select>
            </div>
          )}

          {/* Show prompt if no student selected */}
          {!selectedStudentId ? (
            <div className="text-center py-20">
              <p className="text-6xl mb-4">📊</p>
              <p className="text-slate-400 text-lg">
                {userRole === 'student' 
                  ? 'Loading your progress...' 
                  : 'Select a student to view their training progress'}
              </p>
            </div>
          ) : (
            <>
              {/* Student Info Banner */}
              {selectedStudent && (
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center">
                        <span className="text-xl font-bold text-white">{selectedStudent.initials}</span>
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-white">{selectedStudent.name}</h2>
                        <p className="text-sm text-slate-400">
                          {selectedStudent.enrollmentId} | 
                          <span className={getStageColor(selectedStudent.trainingStage)}> {selectedStudent.trainingStage}</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold text-white">{stats.totalHours}h</p>
                      <p className="text-xs text-slate-400">Total Flight Hours</p>
                    </div>
                  </div>
                </div>
              )}
                {/* Student Progress Checklist */}
              {selectedStudentId && (
                <div className="mb-6">
                  <RequirementsChecklist studentId={selectedStudentId} />
                </div>
              )}

              {/* Overall Progress Bar */}
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-6">
                <h3 className="text-lg font-semibold text-white mb-4">📈 Overall Progress</h3>
                <div className="flex items-center space-x-4">
                  <div className="flex-1 bg-slate-700 rounded-full h-4">
                    <div
                      className={`h-4 rounded-full transition-all duration-500 ${getProgressColor(overallPercent)}`}
                      style={{ width: `${overallPercent}%` }}
                    />
                  </div>
                  <span className="text-white font-bold text-lg">{overallPercent}%</span>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  {stats.totalHours}h / {stats.requirements.totalHours}h required
                </p>
              </div>

              {/* Progress Cards Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                {[
                  { label: 'Total Hours', value: `${stats.totalHours}h`, target: `${stats.requirements.totalHours}h`, percent: stats.hoursPercent },
                  { label: 'Solo Hours', value: `${stats.soloHours}h`, target: `${stats.requirements.soloHours}h`, percent: stats.soloPercent },
                  { label: 'Cross Country', value: `${stats.crossCountryHours}h`, target: `${stats.requirements.crossCountry}h`, percent: stats.crossCountryPercent },
                  { label: 'Instrument', value: `${stats.instrumentHours}h`, target: `${stats.requirements.instrument}h`, percent: stats.instrumentPercent },
                  { label: 'Night Hours', value: `${stats.nightHours}h`, target: `${stats.requirements.nightHours}h`, percent: stats.nightPercent },
                  { label: 'Landings', value: stats.totalLandings.toString(), target: stats.requirements.landings.toString(), percent: stats.landingsPercent },
                ].map((item, i) => (
                  <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                    <p className="text-xs text-slate-400 mb-2">{item.label}</p>
                    <p className="text-lg font-bold text-white">{item.value}</p>
                    <p className="text-xs text-slate-500 mb-2">Target: {item.target}</p>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${getProgressColor(item.percent)}`}
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{item.percent}%</p>
                  </div>
                ))}
              </div>

              {/* Hours Trend Chart (Simple Bar) */}
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-6">
                <h3 className="text-lg font-semibold text-white mb-4">📊 Hours Trend (Last 30 Days)</h3>
                <div className="flex items-end space-x-1 h-32 overflow-x-auto">
                  {hoursByDate.map((day, i) => (
                    <div key={i} className="flex flex-col items-center flex-shrink-0" style={{ width: '3%', minWidth: '20px' }}>
                      <span className="text-[10px] text-slate-400 mb-1">{day.hours > 0 ? day.hours.toFixed(1) : ''}</span>
                      <div
                        className="w-full bg-blue-500/60 rounded-t"
                        style={{ height: `${Math.min(100, day.hours * 30)}px` }}
                      />
                      <span className="text-[8px] text-slate-500 mt-1 transform -rotate-45 origin-top-left whitespace-nowrap">
                        {i % 5 === 0 ? day.date : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Flights */}
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">🛩️ Recent Flights</h3>
                {recentFlights.length === 0 ? (
                  <p className="text-slate-400 text-sm">No flights recorded yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-400 border-b border-slate-700">
                          <th className="pb-3">Date</th>
                          <th className="pb-3">Aircraft</th>
                          <th className="pb-3">Sortie</th>
                          <th className="pb-3">Type</th>
                          <th className="pb-3">Hours</th>
                          <th className="pb-3">Landings</th>
                          <th className="pb-3">Instructor</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-300">
                        {recentFlights.map(flight => (
                          <tr key={flight.id} className="border-b border-slate-700/50">
                            <td className="py-3 text-white">
                              {new Date(flight.flightDate).toLocaleDateString('en-IN')}
                            </td>
                            <td className="py-3">{flight.aircraftReg}</td>
                            <td className="py-3">{flight.sortieType?.replace(/_/g, ' ')}</td>
                            <td className="py-3">
                              <span className={`px-2 py-0.5 rounded text-xs ${
                                flight.flightType === 'SOLO' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
                              }`}>
                                {flight.flightType}
                              </span>
                            </td>
                            <td className="py-3 text-green-400">{flight.totalHours}h</td>
                            <td className="py-3">{flight.landings}</td>
                            <td className="py-3">{flight.instructorName}</td>
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
      </main>
    </ProtectedRoute>
  );
}