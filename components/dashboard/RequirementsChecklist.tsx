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
import { ClipboardList, Lock, TriangleAlert, ChevronDown, ChevronRight } from 'lucide-react';
import { TrainingRequirement } from '@/types';

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

  // Categories the user has explicitly collapsed. Starts empty (everything
  // expanded) rather than collapsed-by-default, so a category containing an
  // incomplete blocking requirement is never hidden from view on load.
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

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

  // ----- Blocking requirements summary (incomplete + flagged) -----
  // blocksAllFlights takes precedence in the summary/badge over blocksSolo
  // when a requirement happens to have both set, since "blocks everything"
  // is the stronger statement.
  const blockingAllFlights = studentReqs.filter((r) => r.blocksAllFlights && !r.isCompleted);
  const blockingSoloOnly = studentReqs.filter((r) => r.blocksSolo && !r.blocksAllFlights && !r.isCompleted);
  const totalBlocking = blockingAllFlights.length + blockingSoloOnly.length;

  // ----- Group requirements by category, ordered by each item's sortOrder -----
  const groupedByCategory: { category: string; items: TrainingRequirement[] }[] = (() => {
    const byCategory = new Map<string, TrainingRequirement[]>();
    for (const r of [...studentReqs].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const cat = r.requirementCategory || 'General';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(r);
    }
    return Array.from(byCategory, ([category, items]) => ({ category, items }));
  })();

  const toggleCategoryCollapsed = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

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
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <ClipboardList className="w-4 h-4" /> Requirements Checklist
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
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <ClipboardList className="w-4 h-4" /> Requirements Checklist
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

      {/* ----- Blocking requirements summary banner ----- */}
      {/* Surfaces blocksSolo/blocksAllFlights — previously set from Admin
          Setup -> Requirements but never shown or enforced anywhere. This
          summarizes every incomplete blocking requirement so it can't be
          missed by scrolling through a flat list. */}
      {totalBlocking > 0 && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <p className="text-sm font-medium text-red-400 flex items-center gap-1.5 mb-1">
            <TriangleAlert className="w-4 h-4" />
            {totalBlocking} incomplete requirement{totalBlocking !== 1 ? 's' : ''} blocking flights
          </p>
          <ul className="text-xs text-red-300/90 space-y-0.5 pl-5 list-disc">
            {blockingAllFlights.map((r) => (
              <li key={r.id}>{r.requirementName} — blocks all flights</li>
            ))}
            {blockingSoloOnly.map((r) => (
              <li key={r.id}>{r.requirementName} — blocks solo flights</li>
            ))}
          </ul>
        </div>
      )}

      {/* ----- Requirements list, grouped by category ----- */}
      <div className="space-y-4">
        {groupedByCategory.map(({ category, items }) => {
          const collapsed = collapsedCategories.has(category);
          const categoryCompleted = items.filter((i) => i.isCompleted).length;
          return (
            <div key={category}>
              <button
                type="button"
                onClick={() => toggleCategoryCollapsed(category)}
                className="w-full flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500 hover:text-slate-400 mb-2 cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-1">
                  {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {category}
                </span>
                <span>{categoryCompleted}/{items.length}</span>
              </button>

              {!collapsed && (
                <div className="space-y-2">
                  {items.map((req) => (
                    <div
                      key={req.id}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        req.isCompleted
                          ? 'bg-green-500/10 border-green-500/30'
                          : 'bg-slate-700/30 border-slate-600/30'
                      }`}
                    >
                      {/* Requirement name, blocking badge, checkbox */}
                      <div className="flex items-center space-x-3 min-w-0">
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

                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <p
                            className={`text-sm font-medium ${
                              req.isCompleted
                                ? 'text-green-400 line-through'
                                : 'text-white'
                            }`}
                          >
                            {req.requirementName}
                          </p>
                          {(req.blocksAllFlights || req.blocksSolo) && (
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${
                                req.isCompleted
                                  ? 'text-slate-500 bg-slate-700/50'
                                  : 'text-red-400 bg-red-500/10'
                              }`}
                              title={
                                req.blocksAllFlights
                                  ? 'Blocks all flights until completed'
                                  : 'Blocks solo flights until completed'
                              }
                            >
                              <Lock className="w-2.5 h-2.5" />
                              {req.blocksAllFlights ? 'Blocks All' : 'Blocks Solo'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Completion details */}
                      {req.isCompleted && (
                        <div className="text-right text-xs text-slate-400 flex-shrink-0">
                          <p>{req.completedDate || '—'}</p>
                          {req.completedBy && <p>by {req.completedBy}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}