// components/dashboard/RequirementsChecklist.tsx
// Shows training requirements checklist for a student
'use client';

import { useEffect, useState } from 'react';
import { useFlightStore } from '@/lib/store';
import { useSession } from 'next-auth/react';


interface Props {
  studentId: string;
}

export default function RequirementsChecklist({ studentId }: Props) {
  const { trainingRequirements, loadTrainingRequirements, toggleRequirement } = useFlightStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadTrainingRequirements(studentId);
  }, [studentId, loadTrainingRequirements]);

  const studentReqs = trainingRequirements.filter(r => r.studentId === studentId);
  const completedCount = studentReqs.filter(r => r.isCompleted).length;
  const totalCount = studentReqs.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role;
  const canEdit = ['admin', 'instructor', 'super_admin'].includes(userRole);


  const handleToggle = async (id: string, currentStatus: boolean) => {
    setLoading(true);
    await toggleRequirement(id, !currentStatus, 'Instructor');
    setLoading(false);
  };

  if (studentReqs.length === 0) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">📋 Requirements Checklist</h3>
        <p className="text-slate-400 text-sm">No requirements defined yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">📋 Requirements Checklist</h3>
        <span className="text-sm text-slate-400">{completedCount}/{totalCount} completed</span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-700 rounded-full h-3 mb-4">
        <div
          className={`h-3 rounded-full transition-all ${progressPercent === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Checklist Items */}
      <div className="space-y-2">
        {studentReqs.map(req => (
          <div
            key={req.id}
            className={`flex items-center justify-between p-3 rounded-lg border transition ${
              req.isCompleted
                ? 'bg-green-500/10 border-green-500/30'
                : 'bg-slate-900/50 border-slate-700/50'
            }`}
          >
            <div className="flex items-center space-x-3">
              <button
                onClick={() => handleToggle(req.id, req.isCompleted)}
                disabled={!canEdit || loading}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition ${
                  !canEdit ? 'opacity-50 cursor-not-allowed' : ''
                } ${
                  req.isCompleted
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'border-slate-500 hover:border-slate-400'
                }`}
              >
                {req.isCompleted && <span className="text-xs">✓</span>}
              </button>
              <div>
                <p className={`text-sm font-medium ${req.isCompleted ? 'text-green-400 line-through' : 'text-white'}`}>
                  {req.requirementName}
                </p>
                {req.isCompleted && req.completedDate && (
                  <p className="text-xs text-slate-500">
                    Completed: {new Date(req.completedDate).toLocaleDateString('en-IN')}
                    {req.completedBy && ` by ${req.completedBy}`}
                  </p>
                )}
              </div>
            </div>
            {req.isCompleted && <span className="text-green-400 text-lg">✅</span>}
          </div>
        ))}
      </div>
    </div>
  );
}