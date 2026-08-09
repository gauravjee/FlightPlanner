// components/students/StudentCard.tsx
'use client';

import { StudentRecord } from '@/types';

interface Props {
  student: StudentRecord;
  onEdit: (student: StudentRecord) => void;
  onDelete: (id: string) => void;
}

export default function StudentCard({ student, onEdit, onDelete }: Props) {
  const medicalExpiry = student.medicalExpiry ? new Date(student.medicalExpiry) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let daysUntilMedical: number | null = null;
  let medicalStatus: 'expired' | 'critical' | 'warning' | 'ok' | 'none' = 'none';
  
  if (medicalExpiry) {
    const diffTime = medicalExpiry.getTime() - today.getTime();
    daysUntilMedical = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (daysUntilMedical < 0) {
      medicalStatus = 'expired';
    } else if (daysUntilMedical <= 5) {
      medicalStatus = 'critical';
    } else if (daysUntilMedical <= 30) {
      medicalStatus = 'warning';
    } else {
      medicalStatus = 'ok';
    }
  }
  
  const stageColors: Record<string, string> = {
    'PPL': 'bg-blue-500/20 text-blue-400',
    'PPL Phase 1': 'bg-blue-500/20 text-blue-400',
    'PPL Phase 2': 'bg-indigo-500/20 text-indigo-400',
    'CPL': 'bg-purple-500/20 text-purple-400',
    'IR': 'bg-cyan-500/20 text-cyan-400',
    'MULTI': 'bg-teal-500/20 text-teal-400',
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center relative">
            <span className="text-white font-bold">{student.initials}</span>
            {medicalStatus === 'expired' && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-pulse" />
            )}
            {medicalStatus === 'critical' && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full" />
            )}
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">{student.name}</h3>
            <p className="text-xs text-slate-400">{student.enrollmentId}</p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${stageColors[student.trainingStage] || 'bg-slate-500/20 text-slate-400'}`}>
          {student.trainingStage}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-xs text-slate-400">Total Hours</p>
          <p className="text-lg font-bold text-white">{student.totalHours}</p>
        </div>

      {/* ===== FIRST SOLO CELEBRATION BADGE ===== */}
      {student.firstSoloDate && (
        <div className="bg-gradient-to-r from-yellow-500/20 to-amber-500/10 border border-yellow-500/30 rounded-lg p-3 mb-3 text-center">
          <p className="text-lg mb-1">🎉</p>
          <p className="text-sm font-bold text-yellow-400">First Solo!</p>
          <p className="text-xs text-yellow-300/80 mt-1">
            {new Date(student.firstSoloDate).toLocaleDateString('en-IN', { 
              weekday: 'short', 
              day: 'numeric', 
              month: 'short', 
              year: 'numeric' 
            })}
          </p>
        </div>
      )}
        
        {/* Medical Status */}
        <div className={`rounded-lg p-3 ${
          medicalStatus === 'expired' ? 'bg-red-500/20 border border-red-500/30' :
          medicalStatus === 'critical' ? 'bg-red-500/10 border border-red-500/20' :
          medicalStatus === 'warning' ? 'bg-yellow-500/10 border border-yellow-500/20' :
          medicalStatus === 'ok' ? 'bg-green-500/10 border border-green-500/20' :
          'bg-slate-900/50'
        }`}>
          <p className="text-xs text-slate-400">Medical</p>
          {medicalStatus === 'expired' ? (
            <p className="text-sm font-bold text-red-400 animate-pulse">
              ⚠ EXPIRED
            </p>
          ) : medicalStatus === 'critical' ? (
            <p className="text-sm font-bold text-red-400">
              🔴 {daysUntilMedical}d left
            </p>
          ) : medicalStatus === 'warning' ? (
            <p className="text-sm font-bold text-yellow-400">
              🟡 {daysUntilMedical}d left
            </p>
          ) : medicalStatus === 'ok' ? (
            <p className="text-sm font-medium text-green-400">
              🟢 {student.medicalExpiry}
            </p>
          ) : (
            <p className="text-sm text-slate-500">N/A</p>
          )}
          {medicalExpiry && medicalStatus !== 'expired' && (
            <p className="text-xs text-slate-500 mt-1">{student.medicalExpiry}</p>
          )}
        </div>
            {/* Assigned Instructor */}
        <div className="bg-slate-900/50 rounded-lg p-3 col-span-2">
          <p className="text-xs text-slate-400">Assigned Instructor</p>
          {student.assignedInstructorName ? (
            <p className="text-sm font-medium text-white">
              👨‍🏫 {student.assignedInstructorName} ({student.assignedInstructorInitials})
            </p>
          ) : (
            <p className="text-sm text-slate-500">Not assigned</p>
          )}
        </div>

        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-xs text-slate-400">Email</p>
          <p className="text-sm text-white truncate">{student.email || 'N/A'}</p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-xs text-slate-400">Phone</p>
          <p className="text-sm text-white">{student.phone || 'N/A'}</p>
        </div>
      </div>

      {/* Medical Alert Bar */}
      {medicalStatus === 'expired' && (
        <div className="mb-3 bg-red-500/20 border border-red-500/30 rounded-lg p-2 animate-pulse">
          <p className="text-xs text-red-400 text-center font-bold">
            ⚠ MEDICAL EXPIRED - GROUNDED UNTIL RENEWED ⚠
          </p>
        </div>
      )}
      {medicalStatus === 'critical' && (
        <div className="mb-3 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
          <p className="text-xs text-red-400 text-center">
            🔴 Medical expires in {daysUntilMedical} days - Schedule renewal
          </p>
        </div>
      )}
      {medicalStatus === 'warning' && (
        <div className="mb-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2">
          <p className="text-xs text-yellow-400 text-center">
            🟡 Medical expires in {daysUntilMedical} days
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex space-x-2">
        <button onClick={() => onEdit(student)} className="flex-1 px-3 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30 transition cursor-pointer">
          ✏️ Edit
        </button>
        <button onClick={() => onDelete(student.id)} className="flex-1 px-3 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition cursor-pointer">
          🗑️ Remove
        </button>
      </div>
    </div>
  );
}