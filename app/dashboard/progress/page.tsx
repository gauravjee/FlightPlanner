// app/dashboard/progress/page.tsx
// Student Progress Tracking Page
// Admin & Instructors see all students, Students see only their own progress
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useFlightStore } from '@/lib/store';
import { useAircraft } from '@/lib/hooks/useAircraft';
import { useStudents } from '@/lib/hooks/useStudents';
import { useFlightRecords } from '@/lib/hooks/useFlightRecords';
import { supabase } from '@/lib/supabase-client';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { PROGRESS_VIEW_ROLES } from '@/lib/permissions';
import RequirementsChecklist from '@/components/dashboard/RequirementsChecklist';
import { ChartColumn, TrendingUp, School, ArrowRight, Plane } from 'lucide-react';
import { isCrossCountrySortie, isInstrumentSortie, isNightSortie, isMultiEngineFlight, isSimulatorFlight } from '@/lib/flight-classification';
import { matchTrainingProgram } from '@/lib/training-programs';

// ============================================================
// TRAINING STAGE REQUIREMENTS — built-in fallback defaults (DGCA/CAA
// typical minimums), used ONLY when a student's training stage doesn't
// resolve to a configured row in the admin-managed `training_programs`
// table (Admin Setup -> Training Programs -> "Progress tracking minimums"),
// or when that program hasn't set a given metric. Previously these
// hardcoded constants were the ONLY source for this page's six progress
// metrics — meaning per-school customization wasn't actually possible and
// this page could silently disagree with whatever an admin configured on
// the Requirements tab. See loadTrainingPrograms/resolveRequirements below.
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

// DB row shape from training_programs — see
// add-training-program-requirement-columns.sql,
// add-multi-engine-simulator-hours-to-training-programs.sql, and
// TrainingProgramsTab.tsx.
interface TrainingProgramRow {
  program_code: string;
  program_name: string;
  required_hours: number;
  solo_hours: number | null;
  cross_country_hours: number | null;
  instrument_hours: number | null;
  night_hours: number | null;
  landings_required: number | null;
  // 2026-08-19: unlike the five fields above, these two have NO built-in
  // PPL/CPL fallback — they don't apply to every training stage the way
  // Solo/Cross-Country/Instrument/Night do. NULL means "not tracked for
  // this program" and the Progress page hides that metric's card entirely
  // rather than silently applying a CPL-shaped number to e.g. a PPL
  // student. See add-multi-engine-simulator-hours-to-training-programs.sql.
  multi_engine_hours: number | null;
  simulator_hours: number | null;
}

// ============================================================
// COLOR HELPERS — mapped onto design tokens so progress bars and
// stage labels track light/dark theme correctly.
// ============================================================
const getProgressColor = (percent: number): string => {
  if (percent >= 100) return 'var(--success)';
  if (percent >= 75) return 'var(--accent)';
  if (percent >= 50) return 'var(--warning-text)';
  if (percent >= 25) return 'var(--warning)';
  return 'var(--danger)';
};

const getStageColor = (stage: string): string => {
  if (stage?.includes('PPL')) return 'var(--accent)';
  if (stage?.includes('CPL')) return 'var(--success)';
  if (stage?.includes('IR')) return 'var(--warning-text)';
  return 'var(--text-secondary)';
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function ProgressPage() {
  const { data: session } = useSession();
  const userRole = session?.user?.role;
  const userStudentId = session?.user?.studentId;

  const { aircraft } = useAircraft();
  const { students } = useStudents();
  const { flightRecords } = useFlightRecords();
  const {
    loadTrainingRequirements,
    getRequirementsForStudent,
  } = useFlightStore();

  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedStage, setSelectedStage] = useState<string>('ALL');
  // Admin-configured per-program requirement minimums — see
  // TrainingProgramsTab.tsx ("Progress tracking minimums") and
  // add-training-program-requirement-columns.sql. Loaded directly via
  // Supabase (not the Zustand store) to match how that admin tab itself
  // reads/writes this table.
  const [trainingPrograms, setTrainingPrograms] = useState<TrainingProgramRow[]>([]);

  // Load data on mount. Students and Flight Records are migrated (SWR,
  // Stages 3 + 4) and now fetch themselves via useStudents()/
  // useFlightRecords() above, no manual load needed.
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('training_programs')
        .select('program_code, program_name, required_hours, solo_hours, cross_country_hours, instrument_hours, night_hours, landings_required, multi_engine_hours, simulator_hours');
      if (error) {
        console.error('Error loading training programs:', error.message);
      } else {
        setTrainingPrograms(data || []);
      }
    })();
  }, []);

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

  // Load the selected student's requirements so the Solo Release status
  // badge below can render as soon as a student is picked, without waiting
  // for the RequirementsChecklist widget further down the page to mount
  // and load them itself. `trainingRequirements` is a single-active-student
  // cache in the store (loadTrainingRequirements replaces the whole array
  // with just one student's rows — see lib/store.ts), so this and the
  // checklist widget end up loading the same data; harmless, just one
  // extra request, and it's what lets the badge show up in the banner
  // above the checklist instead of only inside it.
  useEffect(() => {
    if (selectedStudentId) loadTrainingRequirements(selectedStudentId);
  }, [selectedStudentId, loadTrainingRequirements]);

  // "Released for solo" = no incomplete requirement flagged Blocks Solo —
  // same rule BookingForm.tsx enforces at booking time. Guards against the
  // brief window right after switching students where the cache may still
  // hold the previous student's rows.
  const selectedStudentReqs = selectedStudentId ? getRequirementsForStudent(selectedStudentId) : [];
  const soloReqsMatchSelectedStudent = selectedStudentReqs.length > 0 && selectedStudentReqs.every(r => r.studentId === selectedStudentId);
  const blockingSoloReqs = selectedStudentReqs.filter(r => r.blocksSolo && !r.isCompleted);

  // Resolve the admin-configured training_programs row for the selected
  // student's stage, if any. Tries an exact match against the full stage
  // string first (e.g. "PPL Phase 1" against a row coded/named exactly
  // that), so a school can configure different targets per phase; falls
  // back to matching just the leading token (e.g. "PPL" from "PPL Phase 1"
  // or "CPL" from "CPL Phase 2") against a general program row for any
  // stage that doesn't have its own specific row. See lib/training-programs.ts.
  // (This replaced the old `trainingStage.includes('CPL')` substring check,
  // which only ever distinguished PPL vs CPL and silently defaulted every
  // other stage, including IR/MULTI, to PPL requirements.)
  const matchedProgram = useMemo(
    () => matchTrainingProgram(selectedStudent?.trainingStage, trainingPrograms),
    [selectedStudent, trainingPrograms]
  );

  // Get flights for selected student
  const studentFlights = useMemo(() => {
    if (!selectedStudentId) return [];
    return flightRecords.filter(f => f.studentId === selectedStudentId);
  }, [flightRecords, selectedStudentId]);

  // Calculate statistics
  const stats = useMemo(() => {
    const flights = studentFlights;
    const aircraftById = new Map(aircraft.map(a => [a.id, a]));

    const totalHours = flights.reduce((sum, f) => sum + (f.totalHours || 0), 0);
    const soloFlights = flights.filter(f => f.flightType === 'SOLO');
    const soloHours = soloFlights.reduce((sum, f) => sum + (f.totalHours || 0), 0);
    const dualHours = totalHours - soloHours;
    const crossCountryFlights = flights.filter(f => isCrossCountrySortie(f.sortieType));
    const crossCountryHours = crossCountryFlights.reduce((sum, f) => sum + (f.totalHours || 0), 0);
    const instrumentFlights = flights.filter(f => isInstrumentSortie(f.sortieType));
    const instrumentHours = instrumentFlights.reduce((sum, f) => sum + (f.totalHours || 0), 0);
    const nightFlights = flights.filter(f => isNightSortie(f.sortieType));
    const nightHours = nightFlights.reduce((sum, f) => sum + (f.totalHours || 0), 0);
    const totalLandings = flights.reduce((sum, f) => sum + (f.landings || 0), 0);
    // 2026-08-19: Multi Engine / Simulator hours are classified by WHICH
    // AIRCRAFT was flown (looked up via aircraftId), not by sortieType —
    // see isMultiEngineFlight/isSimulatorFlight in lib/flight-classification.ts.
    const multiEngineFlights = flights.filter(f => isMultiEngineFlight(aircraftById.get(f.aircraftId)));
    const multiEngineHours = multiEngineFlights.reduce((sum, f) => sum + (f.totalHours || 0), 0);
    const simulatorFlights = flights.filter(f => isSimulatorFlight(aircraftById.get(f.aircraftId)));
    const simulatorHours = simulatorFlights.reduce((sum, f) => sum + (f.totalHours || 0), 0);

    // Determine which requirements to use. Built-in defaults (PPL vs CPL,
    // by trainingStage) remain the fallback baseline; matchedProgram's own
    // per-metric columns override on a field-by-field basis when set, so a
    // school can configure e.g. just Solo Hours for a program and still
    // inherit sensible defaults for everything else.
    const fallback = selectedStudent?.trainingStage?.includes('CPL')
      ? CPL_REQUIREMENTS
      : PPL_REQUIREMENTS;
    const requirements = {
      totalHours: matchedProgram?.required_hours ?? fallback.totalHours,
      soloHours: matchedProgram?.solo_hours ?? fallback.soloHours,
      crossCountry: matchedProgram?.cross_country_hours ?? fallback.crossCountry,
      instrument: matchedProgram?.instrument_hours ?? fallback.instrument,
      nightHours: matchedProgram?.night_hours ?? fallback.nightHours,
      landings: matchedProgram?.landings_required ?? fallback.landings,
      // No PPL/CPL built-in fallback for these two — NULL means "not
      // configured for this program" and the UI hides the card entirely
      // instead of applying a number that may not even apply to this stage.
      multiEngine: matchedProgram?.multi_engine_hours ?? null,
      simulator: matchedProgram?.simulator_hours ?? null,
    };

    return {
      totalFlights: flights.length,
      totalHours: Math.round(totalHours * 10) / 10,
      soloHours: Math.round(soloHours * 10) / 10,
      dualHours: Math.round(dualHours * 10) / 10,
      crossCountryHours: Math.round(crossCountryHours * 10) / 10,
      instrumentHours: Math.round(instrumentHours * 10) / 10,
      nightHours: Math.round(nightHours * 10) / 10,
      multiEngineHours: Math.round(multiEngineHours * 10) / 10,
      simulatorHours: Math.round(simulatorHours * 10) / 10,
      totalLandings,
      requirements,
      hoursPercent: Math.min(100, Math.round((totalHours / requirements.totalHours) * 100)),
      soloPercent: Math.min(100, Math.round((soloHours / requirements.soloHours) * 100)),
      crossCountryPercent: Math.min(100, Math.round((crossCountryHours / requirements.crossCountry) * 100)),
      instrumentPercent: Math.min(100, Math.round((instrumentHours / requirements.instrument) * 100)),
      nightPercent: Math.min(100, Math.round((nightHours / requirements.nightHours) * 100)),
      landingsPercent: Math.min(100, Math.round((totalLandings / requirements.landings) * 100)),
      // null when the program hasn't configured this metric — the card
      // and its contribution to overallPercent both get skipped below.
      multiEnginePercent: requirements.multiEngine != null
        ? Math.min(100, Math.round((multiEngineHours / requirements.multiEngine) * 100))
        : null,
      simulatorPercent: requirements.simulator != null
        ? Math.min(100, Math.round((simulatorHours / requirements.simulator) * 100))
        : null,
      overallPercent: 0,
    };
  }, [studentFlights, selectedStudent, matchedProgram, aircraft]);

  // Calculate overall progress — averages whichever metrics actually apply
  // to this student's program. The original six (Total/Solo/Cross-Country/
  // Instrument/Night/Landings) always apply; Multi Engine and Simulator
  // only join the average when the matched program has configured them
  // (their percent is null otherwise), so a PPL student with no
  // multi-engine target isn't dragged down by a metric that doesn't apply.
  const applicablePercents = [
    stats.hoursPercent, stats.soloPercent, stats.crossCountryPercent,
    stats.instrumentPercent, stats.nightPercent, stats.landingsPercent,
    stats.multiEnginePercent, stats.simulatorPercent,
  ].filter((p): p is number => p != null);
  const overallPercent = stats.totalFlights > 0 && applicablePercents.length > 0
    ? Math.round(applicablePercents.reduce((sum, p) => sum + p, 0) / applicablePercents.length)
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

  useSetHeader({ title: 'Student Progress', subtitle: 'Track training progress and achievements' });

  return (
    <ProtectedRoute>
      {/* Includes 'student' — this page doubles as the student's own progress
          view (see the userRole === 'student' auto-select effect above), so
          restricting to staff-only roles would have locked students out of
          their own data. Per the 2026-08-17 role/tab matrix, 'operations'
          also gets view access here (view-only in the matrix — this page has
          no create/edit/delete actions of its own regardless of role).
          maintenance is still excluded (no legitimate use for this page). */}
      <RoleGate allowedRoles={PROGRESS_VIEW_ROLES}>
      <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="max-w-7xl mx-auto px-4 py-6">

          {/* Student Selector (only for admin/instructor) */}
          {userRole !== 'student' && (
            <div className="flex flex-col md:flex-row gap-3 mb-6">
              <select
                value={selectedStudentId}
                onChange={e => setSelectedStudentId(e.target.value)}
                className="flex-1 surface-inner rounded-lg px-4 py-2 focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="">Select a student to view progress</option>
                {visibleStudents.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.initials}) — {s.trainingStage} | {s.totalHours}h
                  </option>
                ))}
              </select>
              <select
                value={selectedStage}
                onChange={e => setSelectedStage(e.target.value)}
                className="surface-inner rounded-lg px-4 py-2 focus:outline-none focus:border-[var(--accent)]"
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
              <ChartColumn className="w-12 h-12 mx-auto mb-4 text-tertiary" />
              <p className="text-secondary text-lg">
                {userRole === 'student'
                  ? 'Loading your progress...'
                  : 'Select a student to view their training progress'}
              </p>
            </div>
          ) : (
            <>
              {/* Student Info Banner */}
              {selectedStudent && (
                <div className="surface-card p-6 mb-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--surface-muted)' }}>
                        <span className="text-xl font-bold">{selectedStudent.initials}</span>
                      </div>
                      <div>
                        <h2 className="text-xl font-bold">{selectedStudent.name}</h2>
                        <p className="text-sm text-secondary">
                          {selectedStudent.enrollmentId} |
                          <span style={{ color: getStageColor(selectedStudent.trainingStage) }}> {selectedStudent.trainingStage}</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold">{stats.totalHours}h</p>
                      <p className="text-xs text-secondary">Total Flight Hours</p>
                    </div>
                  </div>
                  {/* Solo Release status — surfaced here at the top of the
                      page (not just buried in the Requirements Checklist
                      below) since it's the one status instructors most
                      often need at a glance. Same blocksSolo rule
                      BookingForm.tsx enforces at booking time. */}
                  {soloReqsMatchSelectedStudent && (
                    <div className="mt-4 pt-4 border-t divider">
                      {blockingSoloReqs.length > 0 ? (
                        <p className="text-sm flex items-center gap-1.5" style={{ color: 'var(--danger)' }}>
                          🔒 Not released for solo — missing: {blockingSoloReqs.map(r => r.requirementName).join(', ')}
                        </p>
                      ) : (
                        <p className="text-sm flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
                          ✅ Released for solo
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
                {/* Student Progress Checklist */}
              {selectedStudentId && (
                <div className="mb-6">
                  <RequirementsChecklist studentId={selectedStudentId} />
                </div>
              )}

              {/* ----- GROUND SCHOOL PROGRESS LINK ----- */}
              {/* ADD THIS BLOCK RIGHT AFTER THE REQUIREMENTS CHECKLIST */}
              {selectedStudentId && (
                <div className="mb-6">
                  <a
                    href={`/dashboard/ground-school/progress?student=${selectedStudentId}`}
                    className="rounded-xl p-4 transition cursor-pointer no-underline flex items-center justify-between"
                    style={{ backgroundColor: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}
                  >
                    <div>
                      <h3 className="font-semibold flex items-center space-x-2">
                        <School className="w-4 h-4" />
                        <span>Ground School Progress</span>
                      </h3>
                      <p className="text-sm text-secondary mt-1">
                        View detailed theoretical training status, attendance & exam results
                      </p>
                    </div>
                    <ArrowRight className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                  </a>
                </div>
              )}

              {/* Overall Progress Bar */}
              <div className="surface-card p-6 mb-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-secondary" /> Overall Progress
                </h3>
                <div className="flex items-center space-x-4">
                  <div className="flex-1 rounded-full h-4" style={{ backgroundColor: 'var(--border)' }}>
                    <div
                      className="h-4 rounded-full transition-all duration-500"
                      style={{ width: `${overallPercent}%`, backgroundColor: getProgressColor(overallPercent) }}
                    />
                  </div>
                  <span className="font-bold text-lg">{overallPercent}%</span>
                </div>
                <p className="text-xs text-secondary mt-2">
                  {stats.totalHours}h / {stats.requirements.totalHours}h required
                  {!matchedProgram && (
                    <span className="text-tertiary">
                      {' '}(no matching program configured for &ldquo;{selectedStudent?.trainingStage}&rdquo; — using built-in defaults; set one up in Admin Setup → Training Programs)
                    </span>
                  )}
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
                  // Multi Engine / Simulator only show up when the matched
                  // program has configured a target for them — these aren't
                  // universal like the six above (e.g. a PPL student
                  // typically has no Multi Engine target at all).
                  ...(stats.requirements.multiEngine != null && stats.multiEnginePercent != null
                    ? [{ label: 'Multi Engine', value: `${stats.multiEngineHours}h`, target: `${stats.requirements.multiEngine}h`, percent: stats.multiEnginePercent }]
                    : []),
                  ...(stats.requirements.simulator != null && stats.simulatorPercent != null
                    ? [{ label: 'Simulator', value: `${stats.simulatorHours}h`, target: `${stats.requirements.simulator}h`, percent: stats.simulatorPercent }]
                    : []),
                ].map((item, i) => (
                  <div key={i} className="surface-inner p-4">
                    <p className="text-xs text-tertiary mb-2">{item.label}</p>
                    <p className="text-lg font-bold">{item.value}</p>
                    <p className="text-xs text-tertiary mb-2">Target: {item.target}</p>
                    <div className="w-full rounded-full h-2" style={{ backgroundColor: 'var(--border)' }}>
                      <div
                        className="h-2 rounded-full"
                        style={{ width: `${item.percent}%`, backgroundColor: getProgressColor(item.percent) }}
                      />
                    </div>
                    <p className="text-xs text-tertiary mt-1">{item.percent}%</p>
                  </div>
                ))}
              </div>

              {/* Hours Trend Chart (Simple Bar) */}
              <div className="surface-card p-6 mb-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <ChartColumn className="w-4 h-4 text-secondary" /> Hours Trend (Last 30 Days)
                </h3>
                <div className="flex items-end space-x-1 h-32 overflow-x-auto">
                  {hoursByDate.map((day, i) => (
                    <div key={i} className="flex flex-col items-center flex-shrink-0" style={{ width: '3%', minWidth: '20px' }}>
                      <span className="text-[10px] text-tertiary mb-1">{day.hours > 0 ? day.hours.toFixed(1) : ''}</span>
                      <div
                        className="w-full rounded-t"
                        style={{ height: `${Math.min(100, day.hours * 30)}px`, backgroundColor: 'color-mix(in srgb, var(--accent) 60%, transparent)' }}
                      />
                      <span className="text-[8px] text-tertiary mt-1 transform -rotate-45 origin-top-left whitespace-nowrap">
                        {i % 5 === 0 ? day.date : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Flights */}
              <div className="surface-card p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Plane className="w-4 h-4 text-secondary" /> Recent Flights
                </h3>
                {recentFlights.length === 0 ? (
                  <p className="text-secondary text-sm">No flights recorded yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                          <th className="pb-3">Date</th>
                          <th className="pb-3">Aircraft</th>
                          <th className="pb-3">Sortie</th>
                          <th className="pb-3">Type</th>
                          <th className="pb-3">Hours</th>
                          <th className="pb-3">Landings</th>
                          <th className="pb-3">Instructor</th>
                        </tr>
                      </thead>
                      <tbody className="text-secondary">
                        {recentFlights.map(flight => (
                          <tr key={flight.id} className="border-b" style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
                            <td className="py-3" style={{ color: 'var(--text-primary)' }}>
                              {new Date(flight.flightDate).toLocaleDateString('en-IN')}
                            </td>
                            <td className="py-3">{flight.aircraftReg}</td>
                            <td className="py-3">{flight.sortieType?.replace(/_/g, ' ')}</td>
                            <td className="py-3">
                              <span className={`badge ${flight.flightType === 'SOLO' ? 'badge-success' : 'badge-accent'}`}>
                                {flight.flightType}
                              </span>
                            </td>
                            <td className="py-3" style={{ color: 'var(--success)' }}>{flight.totalHours}h</td>
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
      </RoleGate>
    </ProtectedRoute>
  );
}
