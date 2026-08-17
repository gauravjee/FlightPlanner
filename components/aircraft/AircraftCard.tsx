// components/aircraft/AircraftCard.tsx
'use client';

import { useSession } from 'next-auth/react';
import { Aircraft } from '@/types';
import { AIRCRAFT_WRITE_ROLES } from '@/lib/permissions';
import { Pencil, Trash2, Eye } from 'lucide-react';

interface Props {
  aircraft: Aircraft;
  onEdit: (aircraft: Aircraft) => void;
  onDelete: (id: string) => void;
}

export default function AircraftCard({ aircraft, onEdit, onDelete }: Props) {
  // Per the 2026-08-17 role/tab matrix, instructor/maintenance/operations
  // can see the fleet but not add, edit, or remove an aircraft — only
  // admin/super_admin can. Server-side enforcement lives in
  // app/api/aircraft/[id]/route.ts (AIRCRAFT_WRITE_ROLES); this just keeps
  // those roles from seeing controls that would 403 if clicked.
  const { data: session } = useSession();
  const canWrite = AIRCRAFT_WRITE_ROLES.includes(session?.user?.role || '');

  const fuelPercent = (aircraft.currentFuel / aircraft.fuelCapacity) * 100;
  const maintenanceDue = new Date(aircraft.nextMaintenance);
  const daysUntilMx = Math.ceil((maintenanceDue.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  const statusColor = aircraft.status === 'ACTIVE' ? 'var(--success)' :
    aircraft.status === 'MAINTENANCE' ? 'var(--warning)' : 'var(--danger)';
  const statusBadgeClass = aircraft.status === 'ACTIVE' ? 'badge-success' :
    aircraft.status === 'MAINTENANCE' ? 'badge-warning' : 'badge-danger';

  const mxColor = daysUntilMx < 7 ? 'var(--danger)' : daysUntilMx < 30 ? 'var(--warning-text)' : 'var(--text-primary)';
  const fuelColor = fuelPercent < 30 ? 'var(--danger)' : fuelPercent < 60 ? 'var(--warning-text)' : 'var(--success)';

  return (
    <div className="surface-card p-5 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: statusColor }} />
          <div>
            <h3 className="text-lg font-bold">{aircraft.registration}</h3>
            <p className="text-sm text-secondary">{aircraft.model}</p>
          </div>
        </div>
        <span className={`badge ${statusBadgeClass}`}>
          {aircraft.status}
        </span>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="surface-inner p-3">
          <p className="text-xs text-tertiary">Type</p>
          <p className="text-sm font-medium">{aircraft.type}</p>
        </div>
        <div className="surface-inner p-3">
          <p className="text-xs text-tertiary">Year</p>
          <p className="text-sm font-medium">{aircraft.year}</p>
        </div>
        <div className="surface-inner p-3">
          <p className="text-xs text-tertiary">Hobbs Time</p>
          <p className="text-sm font-medium">{aircraft.hobbsTime} hrs</p>
        </div>
        <div className="surface-inner p-3">
          <p className="text-xs text-tertiary">Next Maintenance</p>
          <p className="text-sm font-medium" style={{ color: mxColor }}>
            {aircraft.nextMaintenance}
            {daysUntilMx < 7 && <span className="text-xs ml-1">({daysUntilMx}d)</span>}
          </p>
        </div>
      </div>

      {/* Fuel Bar */}
      <div className="mb-4">
        <div className="flex justify-between mb-1">
          <span className="text-xs text-tertiary">Fuel</span>
          <span className="text-xs font-medium" style={{ color: fuelColor }}>
            {aircraft.currentFuel}L / {aircraft.fuelCapacity}L ({Math.round(fuelPercent)}%)
          </span>
        </div>
        <div className="w-full rounded-full h-2" style={{ backgroundColor: 'var(--border)' }}>
          <div
            className="h-2 rounded-full transition-all"
            style={{ width: `${fuelPercent}%`, backgroundColor: fuelColor }}
          />
        </div>
      </div>

      {/* Actions */}
      {canWrite ? (
        <div className="flex space-x-2">
          <button
            onClick={() => onEdit(aircraft)}
            className="flex-1 px-3 py-2 rounded-lg text-sm transition cursor-pointer flex items-center justify-center gap-1.5"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
          <button
            onClick={() => onDelete(aircraft.id)}
            className="flex-1 px-3 py-2 rounded-lg text-sm transition cursor-pointer flex items-center justify-center gap-1.5"
            style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
          >
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
