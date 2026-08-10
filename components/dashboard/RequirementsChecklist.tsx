// components/dashboard/RequirementsChecklist.tsx
// ---------------------------------------------------------------------------
// Training Requirements Checklist
// ---------------------------------------------------------------------------
// Purpose:
//   Displays a checklist of training requirements for a student (e.g.,
//   medical certificate, ground school subjects, flight hour minimums).
//   Admins and instructors can toggle requirements as completed/incomplete.
//
// Cross‑sync:
//   When a ground school subject (Air Regulations, Air Navigation, etc.) is
//   toggled, the completion status is automatically synced to the
//   ground_school_enrollment table via syncGroundSchoolFromChecklist().
//   This ensures the Ground School Progress page shows the same status.
// ---------------------------------------------------------------------------

'use client';

import { useEffect, useState } from 'react';
import { useFlightStore } from '@/lib/store';
import { useSession } from 'next-auth/react';
import { syncGroundSchoolFromChecklist } from '@/lib/ground-school-sync'; // ← NEW IMPORT

interface Props {
  studentId: string;
}

export default function RequirementsChecklist({ studentId }: Props) {
  // ----- Store access -----
  const {
    trainingRequirements,
    loadTrainingRequirements,
    toggleRequirement,
  } = useFlightStore();

  const [loading, setLoading] = useState(false);

  // ----- Load requirements on mount / when student changes -----
  useEffect(() => {
    loadTrainingRequirements(studentId);
  }, [studentId, loadTrainingRequirements]);

  // ----- Filter requirements for this student -----
  const studentReqs = trainingRequirements.filter(
    (r) => r.studentId === studentId
  );
  const completedCount = studentReqs.filter((r) => r.isCompleted).length;
  const totalCount = studentReqs.length;
  const progressPercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // ----- Permissions -----
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role;
  const canEdit = ['admin', 'instructor', 'super_admin'].includes(userRole);

  // ============================================================
  // Toggle handler — now syncs with ground school module
  // ============================================================
  /**
   * Toggles a requirement's completion status.
   * If the requirement is a ground school subject, also creates/removes
   * an EXEMPTED enrollment in the ground_school_enrollment table.
   *
   * @param id              Requirement ID
   * @param currentStatus   Current isCompleted value
   * @param requirementName Name of the requirement (e.g., "Air Regulations")
   */
  const handleToggle = async (
    id: string,
    currentStatus: boolean,
    requirementName: string
  ) => {
    setLoading(true);

    // Update the requirement in the training_requirements table
    await toggleRequirement(id, !currentStatus, 'Instructor');

    // Cross‑sync: if this is a ground school subject, update ground_school_enrollment
    // (non‑ground‑school requirements are silently ignored by the sync function)
    await syncGroundSchoolFromChecklist(
      studentId,
      requirementName,
      !currentStatus
    );

    setLoading(false);
  };

  // ============================================================
  // Empty state
  // ============================================================
  if (studentReqs.length === 0) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          📋 Requirements Checklist
        </h3>
        <p className="text-slate-400 text-sm">No requirements defined yet.</p>
      </div>
    );
  }

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
      {/* ----- Header with progress bar ----- */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">
          📋 Requirements Checklist
        </h3>
        <span className="text-sm text-slate-400">
          {completedCount}/{totalCount} completed
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-slate-700 rounded-full h-2 mb-4">
        <div
          className="h-2 rounded-full bg-green-500 transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

              

      {/* ----- Requirements list ----- */}
      <div className="space-y-2">
        {studentReqs.map((req) => (
          <div
            key={req.id}
            className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
              req.isCompleted
                ? 'bg-green-500/10 border-green-500/30'
                : 'bg-slate-700/30 border-slate-600/30'
            }`}
          >
            {/* Requirement name and category */}
            <div className="flex items-center space-x-3">
              {/* Checkbox (or clickable icon) */}
              <button
                onClick={() =>
                  canEdit &&
                  handleToggle(req.id, req.isCompleted, req.requirementName)
                }
                disabled={!canEdit || loading}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  req.isCompleted
                    ? 'bg-green-500 border-green-500'
                    : 'border-slate-500 hover:border-slate-400'
                } ${!canEdit ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
              >
                {req.isCompleted && (
                  <svg
                    className="w-3 h-3 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>

              <div>
                <p
                  className={`text-sm font-medium ${
                    req.isCompleted
                      ? 'text-green-400 line-through'
                      : 'text-white'
                  }`}
                >
                  {req.requirementName}
                </p>
                {req.requirementCategory && (
                  <p className="text-xs text-slate-500">
                    {req.requirementCategory}
                  </p>
                )}
              </div>
            </div>

            {/* Completion details */}
            {req.isCompleted && (
              <div className="text-right text-xs text-slate-400">
                <p>{req.completedDate || '—'}</p>
                {req.completedBy && <p>by {req.completedBy}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}