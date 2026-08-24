// components/instructors/InstructorCard.tsx
// Card component displaying instructor details with edit/delete actions
'use client';

import { useSession } from 'next-auth/react';
import { Instructor } from '@/types';
import { canWriteModule } from '@/lib/permissions';
import { useMyPermissionOverrides } from '@/lib/useMyPermissionOverrides';
import { Pencil, Trash2, Eye, CalendarCheck, TriangleAlert, CircleAlert, CircleCheck } from 'lucide-react';

interface Props {
  instructor: Instructor;
  onEdit: (instructor: Instructor) => void;
  onDelete: (id: string) => void;
}

export default function InstructorCard({ instructor, onEdit, onDelete }: Props) {
  // Per the 2026-08-17 role/tab matrix, only admin/super_admin manage the
  // instructor roster by default (operations can view it — see
  // INSTRUCTORS_VIEW_ROLES — but not add/edit/remove), unless a
  // super_admin has granted a per-user override (second-round
  // permission-override feature). Server-side enforcement lives in
  // app/api/instructors/[id]/route.ts.
  const { data: session } = useSession();
  const overrides = useMyPermissionOverrides();
  const canWrite = canWriteModule(session?.user?.role, overrides, 'instructors');

  // Parse ratings - stored as comma-separated string in database
  const ratingsList = (instructor.ratings as string).split(',').map(r => r.trim());

  // CPL expiry status (2026-08-21) — same thresholds/pattern as the SPL
  // expiry status on StudentCard.tsx, applied to the instructor's CPL.
  const cplExpiry = instructor.licenseExpiryDate ? new Date(instructor.licenseExpiryDate) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let daysUntilCpl: number | null = null;
  let cplStatus: 'expired' | 'critical' | 'warning' | 'ok' | 'none' = 'none';

  if (cplExpiry) {
    const diffTime = cplExpiry.getTime() - today.getTime();
    daysUntilCpl = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (daysUntilCpl < 0) {
      cplStatus = 'expired';
    } else if (daysUntilCpl <= 5) {
      cplStatus = 'critical';
    } else if (daysUntilCpl <= 30) {
      cplStatus = 'warning';
    } else {
      cplStatus = 'ok';
    }
  }

  const cplBoxStyle = cplStatus === 'expired'
    ? { backgroundColor: 'var(--danger-soft)', border: '1px solid var(--danger)' }
    : cplStatus === 'critical'
      ? { backgroundColor: 'var(--danger-soft)', border: '1px solid color-mix(in srgb, var(--danger) 50%, transparent)' }
      : cplStatus === 'warning'
        ? { backgroundColor: 'var(--warning-soft)', border: '1px solid color-mix(in srgb, var(--warning) 50%, transparent)' }
        : cplStatus === 'ok'
          ? { backgroundColor: 'var(--success-soft)', border: '1px solid color-mix(in srgb, var(--success) 50%, transparent)' }
          : { backgroundColor: 'var(--surface-muted)' };

  const statusColor = instructor.status === 'AVAILABLE' ? 'var(--success)' :
    instructor.status === 'FLYING' ? 'var(--accent)' : 'var(--text-secondary)';
  const statusBadgeClass = instructor.status === 'AVAILABLE' ? 'badge-success' :
    instructor.status === 'FLYING' ? 'badge-accent' : 'badge-neutral';

  return (
    <div className="surface-card p-5 transition-all">
      {/* Header with initials avatar and status */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `color-mix(in srgb, ${statusColor} 20%, transparent)` }}>
            <span className="font-bold" style={{ color: statusColor }}>{instructor.initials}</span>
          </div>
          <div>
            <h3 className="text-lg font-bold">{instructor.name}</h3>
            <p className="text-xs text-tertiary">{instructor.licenseNumber}</p>
          </div>
        </div>
        <span className={`badge ${statusBadgeClass}`}>
          {instructor.status.replace('_', ' ')}
        </span>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="surface-inner p-3">
          <p className="text-xs text-tertiary">Max Daily Hours</p>
          <p className="text-lg font-bold">{instructor.maxDailyHours}h</p>
        </div>
        <div className="surface-inner p-3">
          <p className="text-xs text-tertiary">Contact</p>
          <p className="text-sm truncate">{instructor.email || 'N/A'}</p>
          <p className="text-xs text-tertiary">{instructor.phone || ''}</p>
        </div>

        {/* CPL Expiry Status — mirrors the SPL box on StudentCard.tsx */}
        <div className="rounded-lg p-3 col-span-2" style={cplBoxStyle}>
          <p className="text-xs text-tertiary">CPL Expiry</p>
          {cplStatus === 'expired' ? (
            <p className="text-sm font-bold animate-pulse flex items-center gap-1" style={{ color: 'var(--danger)' }}>
              <TriangleAlert className="w-3.5 h-3.5" /> EXPIRED
            </p>
          ) : cplStatus === 'critical' ? (
            <p className="text-sm font-bold flex items-center gap-1" style={{ color: 'var(--danger)' }}>
              <CircleAlert className="w-3.5 h-3.5" /> {daysUntilCpl}d left
            </p>
          ) : cplStatus === 'warning' ? (
            <p className="text-sm font-bold flex items-center gap-1" style={{ color: 'var(--warning-text)' }}>
              <CircleAlert className="w-3.5 h-3.5" /> {daysUntilCpl}d left
            </p>
          ) : cplStatus === 'ok' ? (
            <p className="text-sm font-medium flex items-center gap-1" style={{ color: 'var(--success)' }}>
              <CircleCheck className="w-3.5 h-3.5" /> {instructor.licenseExpiryDate}
            </p>
          ) : (
            <p className="text-sm text-tertiary">N/A</p>
          )}
        </div>
      </div>

      {/* Ratings badges */}
      <div className="mb-4">
        <p className="text-xs text-tertiary mb-2">Ratings</p>
        <div className="flex flex-wrap gap-1">
          {ratingsList.map((rating, i) => (
            <span key={i} className="badge badge-accent">
              {rating}
            </span>
          ))}
        </div>
      </div>

      {/* Self-booking indicator — see requireScheduleCreateAccess() in
          lib/api-auth.ts and the toggle in InstructorFormModal.tsx. */}
      {instructor.canSelfBook && (
        <div className="mb-3 flex items-center gap-1.5 text-xs" style={{ color: 'var(--success)' }}>
          <CalendarCheck className="w-3.5 h-3.5" /> Can self-book Schedule slots
        </div>
      )}

      {/* Action buttons */}
      {canWrite ? (
        <div className="flex space-x-2">
          <button onClick={() => onEdit(instructor)}
            className="flex-1 px-3 py-2 rounded-lg text-sm transition cursor-pointer flex items-center justify-center gap-1.5" style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
          <button onClick={() => onDelete(instructor.id)}
            className="flex-1 px-3 py-2 rounded-lg text-sm transition cursor-pointer flex items-center justify-center gap-1.5" style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>
            <Trash2 className="w-3.5 h-3.5" /> Remove
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs" style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-tertiary)' }}>
          <Eye className="w-3 h-3" /> View only
        </div>
      )}
    </div>
  );
}
