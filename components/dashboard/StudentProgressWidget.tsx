// components/dashboard/StudentProgressWidget.tsx
// Compact student progress widget for the main dashboard
// Shows: students flying today, nearing checkride, and needing attention
'use client';

import { useEffect, useMemo } from 'react';
import { useFlightStore } from '@/lib/store';

export default function StudentProgressWidget() {
  const { 
    students, loadStudents, 
    flightRecords, loadFlightRecords,
    scheduledFlights, loadScheduledFlights 
  } = useFlightStore();

  // Load data on mount
  useEffect(() => {
    loadStudents();
    loadFlightRecords();
    loadScheduledFlights();
  }, [loadStudents, loadFlightRecords, loadScheduledFlights]);

  // ============================================================
  // CALCULATE PROGRESS FOR EACH STUDENT
  // ============================================================
  const studentProgress = useMemo(() => {
    return students
      .filter(s => s.status === 'ACTIVE')
      .map(student => {
        const studentFlights = flightRecords.filter(f => f.studentId === student.id);
        const totalHours = studentFlights.reduce((sum, f) => sum + (f.totalHours || 0), 0);
        
        // Determine target hours based on training stage
        const isPPL = student.trainingStage?.includes('PPL');
        const targetHours = isPPL ? 40 : 200;
        const progressPercent = Math.min(100, Math.round((totalHours / targetHours) * 100));

        // Get today's flight for this student
        const todayStr = new Date().toLocaleDateString('en-CA');
        const todayFlights = scheduledFlights.filter(f => {
          const flightDate = new Date(f.startTime).toLocaleDateString('en-CA');
          return f.studentId === student.id && flightDate === todayStr;
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
  }, [students, flightRecords, scheduledFlights]);

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
  // PROGRESS BAR COLOR
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
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">📊 Student Progress Overview</h2>
        <a href="/dashboard/progress" className="text-sm text-blue-400 hover:text-blue-300">
          View All →
        </a>
      </div>

      {/* Flying Today */}
      {flyingToday.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-green-400 mb-3">
            🟢 Flying Today ({flyingToday.length})
          </h3>
          <div className="space-y-2">
            {flyingToday.slice(0, 5).map(p => (
              <div key={p.student.id} className="bg-slate-900/50 rounded-lg p-3 flex items-center space-x-4">
                {/* Student Info */}
                <div className="w-32 flex-shrink-0">
                  <p className="text-sm font-medium text-white truncate">{p.student.name}</p>
                  <p className="text-xs text-slate-500">{p.student.initials} | {p.student.trainingStage}</p>
                </div>
                {/* Progress Bar */}
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-400">{p.totalHours}h / {p.targetHours}h</span>
                    <span className="text-xs text-slate-400">{p.progressPercent}%</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${getProgressColor(p.progressPercent)}`}
                      style={{ width: `${p.progressPercent}%` }}
                    />
                  </div>
                </div>
                {/* Flight Info */}
                <div className="w-40 flex-shrink-0 text-right">
                  {p.todayFlights.map((flight, i) => (
                    <p key={i} className="text-xs text-slate-400">
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
          <h3 className="text-sm font-medium text-blue-400 mb-3">
            🎯 Nearing Checkride ({nearingCheckride.length})
          </h3>
          <div className="space-y-2">
            {nearingCheckride.slice(0, 3).map(p => (
              <div key={p.student.id} className="bg-slate-900/50 rounded-lg p-3 flex items-center space-x-4">
                <div className="w-32 flex-shrink-0">
                  <p className="text-sm font-medium text-white truncate">{p.student.name}</p>
                  <p className="text-xs text-slate-500">{p.student.initials} | {p.student.trainingStage}</p>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-400">{p.totalHours}h / {p.targetHours}h</span>
                    <span className="text-xs text-blue-400 font-medium">{p.progressPercent}%</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${getProgressColor(p.progressPercent)}`}
                      style={{ width: `${p.progressPercent}%` }}
                    />
                  </div>
                </div>
                <div className="w-24 flex-shrink-0 text-right">
                  <p className="text-xs text-blue-400 font-medium">{p.totalHours} hrs</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Needs Attention */}
      {needsAttention.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-red-400 mb-3">
            ⚠️ Needs Attention ({needsAttention.length})
          </h3>
          <div className="space-y-2">
            {needsAttention.slice(0, 3).map(p => (
              <div key={p.student.id} className="bg-slate-900/50 rounded-lg p-3 flex items-center space-x-4">
                <div className="w-32 flex-shrink-0">
                  <p className="text-sm font-medium text-white truncate">{p.student.name}</p>
                  <p className="text-xs text-slate-500">{p.student.initials} | {p.student.trainingStage}</p>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-400">{p.totalHours}h / {p.targetHours}h</span>
                    <span className="text-xs text-red-400 font-medium">{p.progressPercent}%</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${getProgressColor(p.progressPercent)}`}
                      style={{ width: `${p.progressPercent}%` }}
                    />
                  </div>
                </div>
                <div className="w-32 flex-shrink-0 text-right">
                  {p.medicalExpired && (
                    <p className="text-xs text-red-400 font-medium">⚠ Medical Expired!</p>
                  )}
                  {p.medicalWarning && (
                    <p className="text-xs text-yellow-400 font-medium">🟡 Medical: {p.daysUntilMedical}d</p>
                  )}
                  {p.isStalled && (
                    <p className="text-xs text-orange-400 font-medium">⏸ Stalled</p>
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
          <p className="text-slate-400 text-sm">All students are progressing well! 🎉</p>
        </div>
      )}
    </div>
  );
}