// components/students/StudentCard.tsx
'use client';

import { StudentRecord } from '@/types';
import { Pencil, Trash2, PartyPopper, TriangleAlert, CircleAlert, CircleCheck, GraduationCap } from 'lucide-react';

interface Props {
  student: StudentRecord;
  onEdit: (student: StudentRecord) => void;
  onDelete: (id: string) => void;
}

// Distinct categorical colors per training stage, mirroring the pattern
// established for Schedule Board sortie types (SORTIE_COLOR_VARS) — mapped
// onto the existing semantic tokens rather than introducing new hardcoded
// hues, so this still tracks the light/dark theme correctly.
const STAGE_COLOR_VARS: Record<string, string> = {
  'PPL': 'var(--accent)',
  'PPL Phase 1': 'var(--accent)',
  'PPL Phase 2': 'var(--accent-strong)',
  'CPL': 'var(--success)',
  'IR': 'var(--warning-text)',
  'MULTI': 'var(--text-secondary)',
};

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

  const stageColor = STAGE_COLOR_VARS[student.trainingStage] || 'var(--text-secondary)';

  const medicalBoxStyle = medicalStatus === 'expired'
    ? { backgroundColor: 'var(--danger-soft)', border: '1px solid var(--danger)' }
    : medicalStatus === 'critical'
      ? { backgroundColor: 'var(--danger-soft)', border: '1px solid color-mix(in srgb, var(--danger) 50%, transparent)' }
      : medicalStatus === 'warning'
        ? { backgroundColor: 'var(--warning-soft)', border: '1px solid color-mix(in srgb, var(--warning) 50%, transparent)' }
        : medicalStatus === 'ok'
          ? { backgroundColor: 'var(--success-soft)', border: '1px solid color-mix(in srgb, var(--success) 50%, transparent)' }
          : { backgroundColor: 'var(--surface-muted)' };

  return (
    <div className="surface-card p-5 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center relative" style={{ backgroundColor: 'var(--surface-muted)' }}>
            <span className="font-bold">{student.initials}</span>
            {medicalStatus === 'expired' && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full animate-pulse" style={{ backgroundColor: 'var(--danger)' }} />
            )}
            {medicalStatus === 'critical' && (
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--danger)' }} />
            )}
          </div>
          <div>
            <h3 className="text-lg font-bold">{student.name}</h3>
            <p className="text-xs text-tertiary">{student.enrollmentId}</p>
          </div>
        </div>
        <span
          className="badge"
          style={{ backgroundColor: `color-mix(in srgb, ${stageColor} 15%, transparent)`, color: stageColor }}
        >
          {student.trainingStage}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="surface-inner p-3">
          <p className="text-xs text-tertiary">Total Hours</p>
          <p className="text-lg font-bold">{student.totalHours}</p>
        </div>

      {/* ===== FIRST SOLO CELEBRATION BADGE ===== */}
      {student.firstSoloDate && (
        <div className="rounded-lg p-3 mb-3 text-center" style={{ backgroundColor: 'var(--warning-soft)', border: '1px solid color-mix(in srgb, var(--warning) 40%, transparent)' }}>
          <PartyPopper className="w-4 h-4 mx-auto mb-1" style={{ color: 'var(--warning-text)' }} />
          <p className="text-sm font-bold" style={{ color: 'var(--warning-text)' }}>First Solo!</p>
          <p className="text-xs mt-1" style={{ color: 'var(--warning-text)', opacity: 0.8 }}>
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
        <div className="rounded-lg p-3" style={medicalBoxStyle}>
          <p className="text-xs text-tertiary">Medical</p>
          {medicalStatus === 'expired' ? (
            <p className="text-sm font-bold animate-pulse flex items-center gap-1" style={{ color: 'var(--danger)' }}>
              <TriangleAlert className="w-3.5 h-3.5" /> EXPIRED
            </p>
          ) : medicalStatus === 'critical' ? (
            <p className="text-sm font-bold flex items-center gap-1" style={{ color: 'var(--danger)' }}>
              <CircleAlert className="w-3.5 h-3.5" /> {daysUntilMedical}d left
            </p>
          ) : medicalStatus === 'warning' ? (
            <p className="text-sm font-bold flex items-center gap-1" style={{ color: 'var(--warning-text)' }}>
              <CircleAlert className="w-3.5 h-3.5" /> {daysUntilMedical}d left
            </p>
          ) : medicalStatus === 'ok' ? (
            <p className="text-sm font-medium flex items-center gap-1" style={{ color: 'var(--success)' }}>
              <CircleCheck className="w-3.5 h-3.5" /> {student.medicalExpiry}
            </p>
          ) : (
            <p className="text-sm text-tertiary">N/A</p>
          )}
          {medicalExpiry && medicalStatus !== 'expired' && (
            <p className="text-xs text-tertiary mt-1">{student.medicalExpiry}</p>
          )}
        </div>
            {/* Assigned Instructor */}
        <div className="surface-inner p-3 col-span-2">
          <p className="text-xs text-tertiary">Assigned Instructor</p>
          {student.assignedInstructorName ? (
            <p className="text-sm font-medium flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5 text-secondary" /> {student.assignedInstructorName} ({student.assignedInstructorInitials})
            </p>
          ) : (
            <p className="text-sm text-tertiary">Not assigned</p>
          )}
        </div>

        <div className="surface-inner p-3">
          <p className="text-xs text-tertiary">Email</p>
          <p className="text-sm truncate">{student.email || 'N/A'}</p>
        </div>
        <div className="surface-inner p-3">
          <p className="text-xs text-tertiary">Phone</p>
          <p className="text-sm">{student.phone || 'N/A'}</p>
        </div>
      </div>

      {/* Medical Alert Bar */}
      {medicalStatus === 'expired' && (
        <div className="mb-3 rounded-lg p-2 animate-pulse" style={{ backgroundColor: 'var(--danger-soft)', border: '1px solid var(--danger)' }}>
          <p className="text-xs text-center font-bold flex items-center justify-center gap-1" style={{ color: 'var(--danger)' }}>
            <TriangleAlert className="w-3.5 h-3.5" /> MEDICAL EXPIRED - GROUNDED UNTIL RENEWED <TriangleAlert className="w-3.5 h-3.5" />
          </p>
        </div>
      )}
      {medicalStatus === 'critical' && (
        <div className="mb-3 rounded-lg p-2" style={{ backgroundColor: 'var(--danger-soft)', border: '1px solid color-mix(in srgb, var(--danger) 50%, transparent)' }}>
          <p className="text-xs text-center flex items-center justify-center gap-1" style={{ color: 'var(--danger)' }}>
            <CircleAlert className="w-3.5 h-3.5" /> Medical expires in {daysUntilMedical} days - Schedule renewal
          </p>
        </div>
      )}
      {medicalStatus === 'warning' && (
        <div className="mb-3 rounded-lg p-2" style={{ backgroundColor: 'var(--warning-soft)', border: '1px solid color-mix(in srgb, var(--warning) 50%, transparent)' }}>
          <p className="text-xs text-center flex items-center justify-center gap-1" style={{ color: 'var(--warning-text)' }}>
            <CircleAlert className="w-3.5 h-3.5" /> Medical expires in {daysUntilMedical} days
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex space-x-2">
        <button onClick={() => onEdit(student)} className="flex-1 px-3 py-2 rounded-lg text-sm transition cursor-pointer flex items-center justify-center gap-1.5" style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}>
          <Pencil className="w-3.5 h-3.5" /> Edit
        </button>
        <button onClick={() => onDelete(student.id)} className="flex-1 px-3 py-2 rounded-lg text-sm transition cursor-pointer flex items-center justify-center gap-1.5" style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>
          <Trash2 className="w-3.5 h-3.5" /> Remove
        </button>
      </div>
    </div>
  );
}
