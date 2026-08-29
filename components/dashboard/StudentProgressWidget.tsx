// components/dashboard/StudentProgressWidget.tsx
// Compact student progress widget for the main dashboard
// Shows: students flying today, nearing checkride, and needing attention
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plane, Target, TriangleAlert, PartyPopper, ChevronRight } from 'lucide-react';
import { useFlightStore } from '@/lib/store';
import { useStudents } from '@/lib/hooks/useStudents';
import { useFlightRecords } from '@/lib/hooks/useFlightRecords';
import { supabase } from '@/lib/supabase-client';
import { matchTrainingProgram } from '@/lib/training-programs';

// Admin-configured per-program required hours (Admin Setup -> Training
// Programs). This widget used to hardcode targetHours as 40 for any stage
// containing "PPL" and 200 for everything else — meaning it silently
// ignored whatever an admin actually configured on that tab (unlike the
// full Progress page, which already reads training_programs), and treated
// every non-PPL stage as a 200h program including IR/MULTI. Uses the same
// matchTrainingProgram helper as app/dashboard/progress/page.tsx (see
// lib/training-programs.ts) so both pages agree on a given student's
// target hours and both support per-phase rows (e.g. "PPL Phase 1" vs
// "PPL Phase 2" configured as distinct training_programs rows), not just
// one shared row per leading program code.
interface TrainingProgramHours {
  program_code: string;
  program_name: string;
  required_hours: number;
}

export default function StudentProgressWidget() {
  const { students } = useStudents();
  const { flightRecords } = useFlightRecords();
  const { scheduledFlights, loadScheduledFlights } = useFlightStore();

  const [trainingPrograms, setTrainingPrograms] = useState<TrainingProgramHours[]>([]);

  // Load data on mount. Students and Flight Records are migrated (SWR,
  // Stages 3 + 4) and now fetch themselves via useStudents()/
  // useFlightRecords() above, no manual load needed.
  useEffect(() => {
    loadScheduledFlights();
    (async () => {
      const { data, error } = await supabase
        .from('training_programs')
        .select('program_code, program_name, required_hours');
      if (error) {
        console.error('Error loading training programs:', error.message);
      } else {
        setTrainingPrograms(data || []);
      }
    })();
  }, [loadScheduledFlights]);

  // ============================================================
  // CALCULATE PROGRESS FOR EACH STUDENT
  // ============================================================
  const studentProgress = useMemo(() => {
    return students
      .filter(s => s.status === 'ACTIVE')
      .map(student => {
        const studentFlights = flightRecords.filter(f => f.studentId === student.id);
        const totalHours = studentFlights.reduce((sum, f) => sum + (f.totalHours || 0), 0);

        // Determine target hours: admin-configured training_programs row
        // for this student's stage — an exact match (e.g. a school-defined
        // "PPL Phase 1" row) if one exists, else the leading-token match
        // (e.g. "CPL" from "CPL Phase 2") against a general program row —
        // falling back to the same PPL=40h / other=200h built-in default
        // this widget always used, only now scoped correctly to just the
        // fallback case instead of being the only source of truth.
        const matchedProgram = matchTrainingProgram(student.trainingStage, trainingPrograms);
        const isPPL = student.trainingStage?.includes('PPL');
        const targetHours = matchedProgram?.required_hours ?? (isPPL ? 40 : 200);
        const progressPercent = Math.min(100, Math.round((totalHours / targetHours) * 100));

        // Get today's flight for this student. Excludes CANCELLED bookings —
        // a flight that was cancelled today never happened, so listing the
        // student under "Flying Today" for it is misleading (bug fix:
        // this previously had no status filter at all).
        const todayStr = new Date().toLocaleDateString('en-CA');
        const todayFlights = scheduledFlights.filter(f => {
          const flightDate = new Date(f.startTime).toLocaleDateString('en-CA');
          return f.studentId === student.id && flightDate === todayStr && f.status !== 'CANCELLED';
        });

        // Check medical status
        const medicalDate = student.medicalExpiry ? new Date(student.medicalExpiry) : null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysUntilMedical = medicalDate
          ? Math.ceil((medicalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          : 999;
        const medicalExpired = daysUntilMedical < 0;
        const medicalWarning = daysUntilMedical >= 0 && daysUntilMedical <= 30;

        // Check if stalled (no flights in last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentFlights = studentFlights.filter(f =>
          new Date(f.flightDate) >= thirtyDaysAgo
        );
        const isStalled = recentFlights.length === 0 && totalHours > 0;

        return {
          student,
          totalHours,
          targetHours,
          progressPercent,
          todayFlights,
          daysUntilMedical,
          medicalExpired,
          medicalWarning,
          isStalled,
          recentFlights,
        };
      });
  }, [students, flightRecords, scheduledFlights, trainingPrograms]);

  // ============================================================
  // GROUP STUDENTS BY CATEGORY
  // ============================================================
  const flyingToday = studentProgress.filter(p => p.todayFlights.length > 0);
  const nearingCheckride = studentProgress.filter(p =>
    p.progressPercent >= 75 && p.progressPercent < 100 && !flyingToday.includes(p)
  );
  const needsAttention = studentProgress.filter(p =>
    (p.medicalExpired || p.medicalWarning || p.isStalled) &&
    !flyingToday.includes(p) &&
    !nearingCheckride.includes(p)
  );

  // ============================================================
  // PROGRESS BAR COLOR — graduated across the design tokens
  // ============================================================
  const getProgressColor = (percent: number): string => {
    if (percent >= 100) return 'var(--success)';
    if (percent >= 75) return 'var(--accent)';
    if (percent >= 50) return 'var(--warning)';
    if (percent >= 25) return 'var(--warning-text)';
    return 'var(--danger)';
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="surface-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Student Progress Overview</h2>
        <a href="/dashboard/progress" className="text-sm text-accent hover:opacity-80 transition flex items-center gap-1">
          View All <ChevronRight className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Flying Today */}
      {flyingToday.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
            <Plane className="w-3.5 h-3.5" /> Flying Today ({flyingToday.length})
          </h3>
          <div className="space-y-2">
            {flyingToday.slice(0, 5).map(p => (
              <div key={p.student.id} className="surface-inner p-3 flex items-center space-x-4">
                {/* Student Info */}
                <div className="w-32 flex-shrink-0">
                  <p className="text-sm font-medium truncate">{p.student.name}</p>
                  <p className="text-xs text-tertiary">{p.student.initials} | {p.student.trainingStage}</p>
                </div>
                {/* Progress Bar */}
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-secondary">{p.totalHours}h / {p.targetHours}h</span>
                    <span className="text-xs text-secondary">{p.progressPercent}%</span>
                  </div>
                  <div className="w-full rounded-full h-2" style={{ backgroundColor: 'var(--border)' }}>
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${p.progressPercent}%`, backgroundColor: getProgressColor(p.progressPercent) }}
                    />
                  </div>
                </div>
                {/* Flight Info */}
                <div className="w-40 flex-shrink-0 text-right">
                  {p.todayFlights.map((flight, i) => (
                    <p key={i} className="text-xs text-secondary">
                      {new Date(flight.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} {flight.aircraftReg || ''}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nearing Checkride */}
      {nearingCheckride.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-accent mb-3 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" /> Nearing Checkride ({nearingCheckride.length})
          </h3>
          <div className="space-y-2">
            {nearingCheckride.slice(0, 3).map(p => (
              <div key={p.student.id} className="surface-inner p-3 flex items-center space-x-4">
                <div className="w-32 flex-shrink-0">
                  <p className="text-sm font-medium truncate">{p.student.name}</p>
                  <p className="text-xs text-tertiary">{p.student.initials} | {p.student.trainingStage}</p>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-secondary">{p.totalHours}h / {p.targetHours}h</span>
                    <span className="text-xs text-accent font-medium">{p.progressPercent}%</span>
                  </div>
                  <div className="w-full rounded-full h-2" style={{ backgroundColor: 'var(--border)' }}>
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${p.progressPercent}%`, backgroundColor: getProgressColor(p.progressPercent) }}
                    />
                  </div>
                </div>
                <div className="w-24 flex-shrink-0 text-right">
                  <p className="text-xs text-accent font-medium">{p.totalHours} hrs</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Needs Attention */}
      {needsAttention.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5" style={{ color: 'var(--danger)' }}>
            <TriangleAlert className="w-3.5 h-3.5" /> Needs Attention ({needsAttention.length})
          </h3>
          <div className="space-y-2">
            {needsAttention.slice(0, 3).map(p => (
              <div key={p.student.id} className="surface-inner p-3 flex items-center space-x-4">
                <div className="w-32 flex-shrink-0">
                  <p className="text-sm font-medium truncate">{p.student.name}</p>
                  <p className="text-xs text-tertiary">{p.student.initials} | {p.student.trainingStage}</p>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-secondary">{p.totalHours}h / {p.targetHours}h</span>
                    <span className="text-xs font-medium" style={{ color: 'var(--danger)' }}>{p.progressPercent}%</span>
                  </div>
                  <div className="w-full rounded-full h-2" style={{ backgroundColor: 'var(--border)' }}>
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${p.progressPercent}%`, backgroundColor: getProgressColor(p.progressPercent) }}
                    />
                  </div>
                </div>
                <div className="w-32 flex-shrink-0 text-right">
                  {p.medicalExpired && (
                    <p className="text-xs font-medium" style={{ color: 'var(--danger)' }}>Medical Expired!</p>
                  )}
                  {p.medicalWarning && (
                    <p className="text-xs font-medium" style={{ color: 'var(--warning-text)' }}>Medical: {p.daysUntilMedical}d</p>
                  )}
                  {p.isStalled && (
                    <p className="text-xs font-medium" style={{ color: 'var(--warning-text)' }}>Stalled</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {flyingToday.length === 0 && nearingCheckride.length === 0 && needsAttention.length === 0 && (
        <div className="text-center py-6">
          <PartyPopper className="w-5 h-5 text-tertiary mx-auto mb-2" />
          <p className="text-secondary text-sm">All students are progressing well!</p>
        </div>
      )}
    </div>
  );
}
