// app/dashboard/flights/page.tsx
// Flight Records & Digital Logbook page
'use client';
import { useSetHeader } from '@/components/ui/HeaderContext';

import { generateStudentLogbook } from '@/lib/pdf';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useFlightStore } from '@/lib/store';
import FlightRecordForm from '@/components/flights/FlightRecordForm';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { FLIGHT_RECORDS_VIEW_ROLES, canWriteModule } from '@/lib/permissions';
import { useMyPermissionOverrides } from '@/lib/useMyPermissionOverrides';
import { FileText, NotebookPen, ClipboardList, PartyPopper, Star, ClipboardCheck, Eye } from 'lucide-react';
import { ScheduledFlight } from '@/types';

export default function FlightsPage() {
  const { data: session } = useSession();
  const overrides = useMyPermissionOverrides();
  // operations isn't on this tab at all by default; maintenance can view
  // the logbook but not log a flight (2026-08-17 role/tab matrix). Either
  // can gain access via a super_admin-granted per-user override (see
  // OVERRIDE_ELIGIBLE_ROLES) — operations can even gain visibility into
  // this tab entirely, not just an upgrade within it. Server-side
  // enforcement lives in app/api/flight-records/route.ts
  // (requireModuleAccess('flightRecords')).
  const canWrite = canWriteModule(session?.user?.role, overrides, 'flightRecords');
  const {
    flightRecords, students, sortieTypes, exercises, loadingFlights,
    scheduledFlights,
    loadFlightRecords, loadStudents, loadAircraft, loadSortieTypes, loadExercises,
    loadScheduledFlights, loadInstructors,
  } = useFlightStore();
  const [showForm, setShowForm] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState('ALL');
  // The flight a "Complete Entry" click opened FlightRecordForm for — see
  // the Pending Logbook Entries panel below. null when the form is closed
  // or was opened via the plain "Log Flight" button instead.
  const [resolvingFlight, setResolvingFlight] = useState<ScheduledFlight | null>(null);

  useEffect(() => {
    // loadFlightRecords() resolves each record's aircraft/student name
    // client-side, in the store, from whatever's already in the aircraft/
    // students state at the moment it runs — it doesn't reactively update
    // if that data arrives later. Aircraft wasn't loaded by this page at
    // all before, so records rendered with "Unknown" aircraft whenever
    // this was the first page visited in the session. Awaiting both loads
    // first removes that race instead of just usually getting lucky on
    // load order.
    (async () => {
      await Promise.all([loadStudents(), loadAircraft()]);
      loadFlightRecords();
    })();
    loadSortieTypes();
    loadExercises();
    loadInstructors();
    loadScheduledFlights();
  }, [loadStudents, loadAircraft, loadFlightRecords, loadSortieTypes, loadExercises, loadInstructors, loadScheduledFlights]);

  const filteredRecords = selectedStudent === 'ALL'
    ? flightRecords
    : flightRecords.filter(r => r.studentId === selectedStudent);

  // Flights checked out via Debrief with "auto-create logbook entry"
  // unchecked — completed and counted as flown, but still missing a
  // flight_records row (see DebriefForm.tsx and the logbookPending field
  // on ScheduledFlight in types/index.ts).
  const pendingLogbookFlights = scheduledFlights.filter(f => f.status === 'COMPLETED' && f.logbookPending);

  const totalHours = flightRecords.reduce((s, r) => s + r.totalHours, 0);
  const totalFlights = flightRecords.length;
  const totalLandings = flightRecords.reduce((s, r) => s + r.landings, 0);

  useSetHeader({
    title: 'Flight Records',
    subtitle: 'Digital Logbook',
    action: (
      <div className="flex space-x-2">
       {selectedStudent === 'ALL' ? (
        <span className="px-3 py-2 surface-inner text-tertiary rounded-lg text-xs cursor-not-allowed flex items-center space-x-1"
          title="Select a specific student to export their logbook">
          <FileText className="w-3.5 h-3.5" /> Export Logbook
          <span className="text-[10px] text-tertiary">(select student)</span>
        </span>
      ) : (
        <button
          onClick={() => {
            const student = students.find(s => s.id === selectedStudent);
            const studentFlights = flightRecords.filter(r => r.studentId === selectedStudent);
            if (student && studentFlights.length > 0) {
              generateStudentLogbook(student, studentFlights);
            }
          }}
          className="px-3 py-2 rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5"
          style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
        >
          <FileText className="w-3.5 h-3.5" /> Export Logbook
        </button>
      )}
        {canWrite ? (
          <button
            onClick={() => { setResolvingFlight(null); setShowForm(true); }}
            className="px-4 py-2 rounded-lg transition cursor-pointer font-bold flex items-center gap-1.5"
            style={{ backgroundColor: 'var(--success)', color: '#04141a' }}
          >
            <NotebookPen className="w-3.5 h-3.5" /> Log Flight
          </button>
        ) : (
          <span className="px-3 py-2 surface-inner text-tertiary rounded-lg text-xs flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" /> View only
          </span>
        )}
      </div>
    ),
  });

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={FLIGHT_RECORDS_VIEW_ROLES} moduleKey="flightRecords">
    <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* ----- PENDING LOGBOOK ENTRIES ----- */}
        {/* Flights checked out with "auto-create logbook entry" unchecked —
            marked completed and flown, but the training record (hours,
            first-solo credit) hasn't landed yet. See DebriefForm.tsx.
            canWrite-gated below (the "Complete Entry" action logs a flight,
            same write permission as the header "Log Flight" button). */}
        {canWrite && pendingLogbookFlights.length > 0 && (
          <div
            className="rounded-xl p-4 mb-6"
            style={{ backgroundColor: 'var(--warning-soft)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)' }}
          >
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-3" style={{ color: 'var(--warning-text)' }}>
              <ClipboardCheck className="w-4 h-4" /> Pending Logbook Entries ({pendingLogbookFlights.length})
            </h2>
            <div className="space-y-2">
              {pendingLogbookFlights.map(flight => (
                <div key={flight.id} className="surface-card p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-sm">
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {flight.studentName || 'No Student'}
                    </span>
                    <span className="text-tertiary"> · {flight.aircraftReg} · {new Date(flight.startTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {flight.instructorName}</span>
                  </div>
                  <button
                    onClick={() => { setResolvingFlight(flight); setShowForm(true); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
                    style={{ backgroundColor: 'var(--warning)', color: '#04141a' }}
                  >
                    Complete Entry
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Flights', value: totalFlights, color: 'var(--accent)' },
            { label: 'Total Hours', value: `${totalHours.toFixed(1)}h`, color: 'var(--success)' },
            { label: 'Total Landings', value: totalLandings, color: 'var(--accent-strong)' },
            { label: 'Students Flown', value: [...new Set(flightRecords.map(r => r.studentId))].length, color: 'var(--warning-text)' },
          ].map((stat, i) => (
            <div key={i} className="surface-card p-4">
              <p className="text-xs text-tertiary">{stat.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: stat.color }}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Filter & Records */}
        <div className="surface-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-secondary" /> Flight Log
            </h2>
            <select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)}
              className="surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]">
              <option value="ALL">All Students</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {loadingFlights ? (
            <p className="text-secondary text-center py-8">Loading records...</p>
          ) : filteredRecords.length === 0 ? (
            <p className="text-secondary text-center py-8">No flight records found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Student</th>
                    <th className="pb-3">Aircraft</th>
                    <th className="pb-3">Time</th>
                    <th className="pb-3">Hrs</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Sortie</th>
                    <th className="pb-3">Exercise</th>
                    <th className="pb-3">Landings</th>
                    <th className="pb-3">Performance</th>
                  </tr>
                </thead>
                <tbody className="text-secondary">
                  {filteredRecords.map(record => (
                    <tr key={record.id} className="border-b transition" style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
                      <td className="py-3 text-xs" style={{ color: 'var(--text-primary)' }}>
                        {new Date(record.flightDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </td>
                      <td className="py-3 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{record.studentName}</td>
                      <td className="py-3 text-xs">{record.aircraftReg}</td>
                      <td className="py-3 text-xs">{record.departureTime?.slice(0,5)}-{record.arrivalTime?.slice(0,5)}</td>
                      <td className="py-3 font-medium" style={{ color: 'var(--success)' }}>{record.totalHours}</td>
                      <td className="py-3">
                        <span className={`badge ${
                          record.flightType === 'SOLO' ? 'badge-success' :
                          record.flightType === 'DUAL' ? 'badge-accent' :
                          'badge-warning'
                        }`}>{record.flightType}</span>

                         {/* ===== FIRST SOLO BADGE ===== */}
                          {record.flightType === 'SOLO' &&
                          record.flightDate === (() => {
                            const student = students.find(s => s.id === record.studentId);
                            return student?.firstSoloDate;
                          })() && (
                            <span
                              className="ml-2 px-1.5 py-0.5 rounded text-xs font-bold animate-pulse inline-flex items-center gap-0.5"
                              style={{ backgroundColor: 'var(--warning-soft)', color: 'var(--warning-text)' }}
                              title="First Solo Flight! 🎉"
                            >
                              <PartyPopper className="w-3 h-3" /> FIRST SOLO
                            </span>
                          )}
                      </td>
                      <td className="py-3 text-xs">
                        {sortieTypes.find(st => st.type_code === record.sortieType)?.type_name
                          || record.sortieType?.replace(/_/g, ' ')
                          || '—'}
                      </td>
                      <td className="py-3 text-xs" title={exercises.find(ex => ex.short_code === record.exercise)?.full_description || ''}>
                        {record.exercise || '—'}
                      </td>
                      <td className="py-3 text-xs">{record.landings}</td>
                      <td className="py-3 text-xs flex items-center gap-1" style={{ color: 'var(--warning-text)' }}>
                        <Star className="w-3.5 h-3.5" /> {record.studentPerformance}/5
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <FlightRecordForm
          onClose={() => { setShowForm(false); setResolvingFlight(null); }}
          studentId={resolvingFlight?.studentId}
          scheduledFlightId={resolvingFlight?.id}
          prefill={resolvingFlight ? {
            aircraftId: resolvingFlight.aircraftId,
            instructorId: resolvingFlight.instructorId,
            sortieType: resolvingFlight.sortieType,
            ...(resolvingFlight.pendingDebrief || {}),
          } : undefined}
        />
      )}
    </main>
    </RoleGate>
    </ProtectedRoute>
  );
}
