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
import { syncGroundSchoolFromChecklist, getGroundSchoolSubject } from '@/lib/ground-school-sync';
import { isSPLRequirement } from '@/lib/spl';
import { useEscapeToClose } from '@/lib/useEscapeToClose';
import { ClipboardList, Lock, TriangleAlert, ChevronDown, ChevronRight, GraduationCap, IdCard, X } from 'lucide-react';
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
    students,
    updateStudent,
  } = useFlightStore();

  const [loading, setLoading] = useState(false);

  // 2026-08-19: checking a ground-school-linked requirement here used to
  // silently create a fake EXEMPTED exam record (100%/PASS, no DGCA data)
  // via syncGroundSchoolFromChecklist — the same gap already fixed on
  // Ground School -> Progress and the attendance page's exam editor, just
  // missed here since this is a third, independent entry point into the
  // same underlying sync. dgcaModal holds which requirement is pending
  // entry; null = no modal open. Only shown when CHECKING a requirement
  // that resolves to a real ground school subject — unchecking, and any
  // non-ground-school requirement, still toggles immediately with no
  // extra step.
  const [dgcaModal, setDgcaModal] = useState<{ id: string; requirementName: string; subjectName: string } | null>(null);
  const [dgcaRollNumber, setDgcaRollNumber] = useState('');
  const [dgcaScore, setDgcaScore] = useState('');
  const [dgcaError, setDgcaError] = useState('');

  // 2026-08-20: checking the "Student Pilot License" requirement used to
  // mark a student SPL-complete with no actual SPL number captured
  // anywhere — the number could only ever be entered separately, on the
  // Student profile form, and nothing tied the two together. Same shape as
  // the DGCA modal above: only shown when CHECKING this specific
  // requirement AND the student doesn't already have a number on file
  // (entering it on the Student form first skips the modal entirely —
  // it's already captured). Server-side enforcement of the same rule lives
  // in app/api/admin/requirements/toggle/route.ts, so this can't be
  // bypassed by calling that route directly.
  const [splModal, setSplModal] = useState<{ id: string; requirementName: string } | null>(null);

  // 2026-08-21 (accessibility round): let Escape dismiss whichever of this
  // component's two inline modals (DGCA / SPL) is currently open — see
  // lib/useEscapeToClose.ts.
  useEscapeToClose(() => {
    if (dgcaModal) setDgcaModal(null);
    if (splModal) setSplModal(null);
  });
  const [splNumberInput, setSplNumberInput] = useState('');
  const [splError, setSplError] = useState('');

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
    requirementName: string,
    examData?: { rollNumber: string; score: number }
  ) => {
    setLoading(true);

    // Update the requirement in the training_requirements table. As of
    // 2026-08-19 this goes through a server-side API route (see
    // lib/store.ts's toggleRequirement -> PATCH /api/admin/requirements/
    // toggle) that enforces REQUIREMENTS_WRITE_ROLES and derives
    // completedBy from the verified session itself — not from anything
    // passed in here. This used to hardcode the literal string 'Instructor'
    // client-side regardless of who was actually signed in (fixed earlier
    // the same day by deriving it here instead), then got hardened further
    // so the client can't influence that identity at all, only the server
    // can. This is the only call site of toggleRequirement in the app, so
    // it affects every requirement, including "Solo Release" — the whole
    // point of that one is knowing exactly which instructor/admin granted
    // it, and now that can't be spoofed by a modified client either.
    await toggleRequirement(id, !currentStatus);

    // Cross‑sync: if this is a ground school subject, update ground_school_enrollment
    // (non‑ground‑school requirements are silently ignored by the sync function).
    // examData (DGCA roll number + score) is only ever set when completing
    // — see handleCheckboxClick below, which collects it via a modal before
    // calling this at all.
    await syncGroundSchoolFromChecklist(
      studentId,
      requirementName,
      !currentStatus,
      examData
    );

    setLoading(false);
  };

  // Dispatches a checkbox click: unchecking, or checking a non-ground-school
  // requirement, toggles immediately as before. Checking a requirement that
  // resolves to a real ground school subject opens the DGCA modal instead —
  // this subject is examined by DGCA, not the FTO, so a completion needs
  // the student's actual roll number and score, not a silent fake pass.
  const handleCheckboxClick = async (req: TrainingRequirement) => {
    if (!canEdit || loading) return;

    if (req.isCompleted) {
      handleToggle(req.id, true, req.requirementName);
      return;
    }

    // SPL takes priority over the ground-school check below — it's never a
    // ground school subject, but checking name-match order explicitly here
    // keeps this dispatcher from depending on which check happens to run
    // first if that ever changes.
    if (isSPLRequirement(req.requirementName)) {
      const student = students.find(s => s.id === studentId);
      if (student?.splNumber?.trim()) {
        // Already on file (entered directly on the Student profile form,
        // at creation or later) — nothing more to capture.
        handleToggle(req.id, false, req.requirementName);
      } else {
        setSplError('');
        setSplNumberInput('');
        setSplModal({ id: req.id, requirementName: req.requirementName });
      }
      return;
    }

    const subjectName = await getGroundSchoolSubject(req.requirementName);
    if (subjectName) {
      setDgcaError('');
      setDgcaRollNumber('');
      setDgcaScore('');
      setDgcaModal({ id: req.id, requirementName: req.requirementName, subjectName });
    } else {
      handleToggle(req.id, false, req.requirementName);
    }
  };

  // Validates and submits the DGCA modal, then completes the requirement.
  const submitDgcaModal = async () => {
    if (!dgcaModal) return;
    const rollNumber = dgcaRollNumber.trim();
    const score = parseFloat(dgcaScore);

    if (!rollNumber) {
      setDgcaError('DGCA roll number is required to record a pass.');
      return;
    }
    if (dgcaScore === '' || Number.isNaN(score) || score < 0 || score > 100) {
      setDgcaError('Enter a valid exam score (0–100).');
      return;
    }

    setDgcaError('');
    await handleToggle(dgcaModal.id, false, dgcaModal.requirementName, { rollNumber, score });
    setDgcaModal(null);
    setDgcaRollNumber('');
    setDgcaScore('');
  };

  // Validates and saves the SPL modal's number onto the student's profile
  // (same field/API path as editing it directly on the Student form), then
  // completes the requirement. If the profile save fails, the requirement
  // is deliberately NOT marked complete — surfacing the failure here rather
  // than silently toggling with no number on file, since the toggle route
  // now re-checks for a number server-side anyway (see toggle/route.ts) and
  // would reject it regardless.
  const submitSplModal = async () => {
    if (!splModal) return;
    const splNumber = splNumberInput.trim();

    if (!splNumber) {
      setSplError('SPL Number is required to mark this complete.');
      return;
    }

    setSplError('');
    const saved = await updateStudent(studentId, { splNumber });
    if (!saved) {
      setSplError('Failed to save the SPL Number — try again.');
      return;
    }
    await handleToggle(splModal.id, false, splModal.requirementName);
    setSplModal(null);
    setSplNumberInput('');
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
                          onClick={() => handleCheckboxClick(req)}
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

      {/* ----- DGCA exam entry modal ----- */}
      {/* 2026-08-19: this subject is examined by DGCA, not the FTO — a
          completion recorded here needs the student's actual DGCA roll
          number and score, not a silent 100%/PASS with no roll number
          (the same fix already applied to Ground School -> Progress's
          "Mark as Completed" and the attendance page's exam editor). */}
      {dgcaModal && (
        <div
          className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setDgcaModal(null)}
        >
          <div
            className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <GraduationCap className="w-4 h-4" /> Complete {dgcaModal.requirementName}
              </h3>
              <button onClick={() => setDgcaModal(null)} className="p-2 rounded-lg hover:bg-slate-700 cursor-pointer" aria-label="Close">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <p className="text-sm text-slate-400">
                {dgcaModal.subjectName} is examined by DGCA, not the FTO — enter the student&apos;s
                actual DGCA exam result to mark this complete.
              </p>

              <div>
                <label className="block text-sm text-slate-400 mb-1">DGCA Roll Number *</label>
                <input
                  type="text"
                  value={dgcaRollNumber}
                  onChange={e => setDgcaRollNumber(e.target.value)}
                  placeholder="e.g., DGCA-2026-00123"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-slate-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Exam Score Received *</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={dgcaScore}
                  onChange={e => setDgcaScore(e.target.value)}
                  placeholder="e.g., 85"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-slate-500"
                />
              </div>

              {dgcaError && <p className="text-xs text-red-400">{dgcaError}</p>}

              <div className="flex space-x-2">
                <button
                  onClick={submitDgcaModal}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-500 hover:bg-green-600 text-white transition"
                >
                  Record Pass
                </button>
                <button
                  onClick={() => setDgcaModal(null)}
                  className="px-4 py-2 rounded-lg text-sm bg-slate-700 hover:bg-slate-600 text-white transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----- SPL Number capture modal ----- */}
      {/* 2026-08-20: a student can't be marked SPL-complete with no SPL
          Number on file — enforced here (only shown when one isn't already
          on the profile) and re-checked server-side in
          app/api/admin/requirements/toggle/route.ts. */}
      {splModal && (
        <div
          className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setSplModal(null)}
        >
          <div
            className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <IdCard className="w-4 h-4" /> Complete {splModal.requirementName}
              </h3>
              <button onClick={() => setSplModal(null)} className="p-2 rounded-lg hover:bg-slate-700 cursor-pointer" aria-label="Close">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <p className="text-sm text-slate-400">
                No SPL Number is on file for this student yet — enter it to mark this complete.
                This saves to the student&apos;s profile the same as editing it there directly.
              </p>

              <div>
                <label className="block text-sm text-slate-400 mb-1">SPL Number *</label>
                <input
                  type="text"
                  value={splNumberInput}
                  onChange={e => setSplNumberInput(e.target.value)}
                  placeholder="e.g., SPL-2026-0142"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-slate-500"
                  autoFocus
                />
              </div>

              {splError && <p className="text-xs text-red-400">{splError}</p>}

              <div className="flex space-x-2">
                <button
                  onClick={submitSplModal}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-500 hover:bg-green-600 text-white transition"
                >
                  Save &amp; Complete
                </button>
                <button
                  onClick={() => setSplModal(null)}
                  className="px-4 py-2 rounded-lg text-sm bg-slate-700 hover:bg-slate-600 text-white transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}