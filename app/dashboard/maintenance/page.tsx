// app/dashboard/maintenance/page.tsx
// Maintenance tracking page - view, add, complete maintenance records
'use client';

import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useAircraft } from '@/lib/hooks/useAircraft';
import {
  useMaintenanceRecords, withMaintenanceRecordNames,
  addMaintenanceRecord, updateMaintenanceRecord, removeMaintenanceRecord,
} from '@/lib/hooks/useMaintenanceRecords';
import { MaintenanceRecord } from '@/types';
import MaintenanceForm from '@/components/maintenance/MaintenanceForm';
import MaintenanceDueSection from '@/components/maintenance/MaintenanceDueSection';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import RoleGate from '@/components/ui/RoleGate';
import { MAINTENANCE_VIEW_ROLES, canWriteModule } from '@/lib/permissions';
import { useMyPermissionOverrides } from '@/lib/useMyPermissionOverrides';
import { Wrench, Check, Pencil, Trash2, TriangleAlert, Hourglass, Eye } from 'lucide-react';
import { todayIST } from '@/lib/ist';

export default function MaintenancePage() {
  const { data: session } = useSession();
  const overrides = useMyPermissionOverrides();
  // maintenance keeps full read/write here by default; instructor/
  // operations are view-only (2026-08-17 role/tab matrix) unless a
  // super_admin has granted a per-user override. Server-side enforcement
  // lives in app/api/maintenance-records/[id]/route.ts
  // (requireModuleAccess('maintenance')).
  const canWrite = canWriteModule(session?.user?.role, overrides, 'maintenance');
  const { aircraft } = useAircraft();
  const { maintenanceRecords: rawMaintenanceRecords, isLoading: loadingMaintenance } = useMaintenanceRecords();
  // 2026-09-01 (SWR migration, Stage 6): aircraftReg/aircraftType are no
  // longer baked into the fetched rows — see lib/hooks/useMaintenanceRecords.ts's
  // file header for why. No load effect needed either; useMaintenanceRecords()/
  // useAircraft() fetch on mount themselves.
  const maintenanceRecords = withMaintenanceRecordNames(rawMaintenanceRecords, aircraft);

  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MaintenanceRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MaintenanceRecord | null>(null);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterAircraft, setFilterAircraft] = useState('ALL');

  const filteredRecords = maintenanceRecords.filter(r => {
    const matchStatus = filterStatus === 'ALL' || r.status === filterStatus;
    const matchAircraft = filterAircraft === 'ALL' || r.aircraftId === filterAircraft;
    return matchStatus && matchAircraft;
  });

  // Stats
  const scheduled = maintenanceRecords.filter(r => r.status === 'SCHEDULED').length;
  const inProgress = maintenanceRecords.filter(r => r.status === 'IN_PROGRESS').length;
  const overdue = maintenanceRecords.filter(r => r.isOverdue).length;
  const totalCost = maintenanceRecords.reduce((s, r) => s + r.cost, 0);

  const handleAdd = () => {
    setEditingRecord(null);
    setShowForm(true);
  };

  const handleEdit = (record: MaintenanceRecord) => {
    setEditingRecord(record);
    setShowForm(true);
  };

  const handleSave = (data: Partial<MaintenanceRecord>) => {
    if (editingRecord) {
      updateMaintenanceRecord(editingRecord.id, data);
    } else {
      addMaintenanceRecord(data as MaintenanceRecord);
    }
    setShowForm(false);
    setEditingRecord(null);
  };

  const handleComplete = (record: MaintenanceRecord) => {
    updateMaintenanceRecord(record.id, {
      status: 'COMPLETED',
      completedDate: todayIST(),
      // Snap the window's end to the real completion time if it wrapped
      // early or was open-ended — doesn't affect blocking (COMPLETED never
      // blocks), just keeps the record's history honest for reporting.
      ...(record.maintenanceStart ? { maintenanceEnd: new Date().toISOString() } : {}),
    });
  };

  // Themed confirm dialog instead of window.confirm() — see ConfirmDialog.tsx.
  const handleDeleteClick = (record: MaintenanceRecord) => setDeleteTarget(record);
  const handleDeleteConfirm = () => {
    if (deleteTarget) removeMaintenanceRecord(deleteTarget.id);
    setDeleteTarget(null);
  };

  // Quick-extend — bumps an existing maintenanceEnd forward without
  // reopening the full edit form. Only applies to records that already have
  // an end time; an open-ended (no end set yet) record has nothing to
  // extend from — use Edit to set one instead.
  const handleExtend = (record: MaintenanceRecord, addMs: number) => {
    if (!record.maintenanceEnd) return;
    const newEnd = new Date(new Date(record.maintenanceEnd).getTime() + addMs);
    updateMaintenanceRecord(record.id, { maintenanceEnd: newEnd.toISOString() });
  };

  const formatISTDateTime = (iso: string): string =>
    new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  useSetHeader({
    title: 'Maintenance Tracking',
    subtitle: 'Aircraft maintenance records',
    action: canWrite ? (
      <button
        onClick={handleAdd}
        className="px-4 py-2 rounded-lg transition cursor-pointer font-semibold text-sm flex items-center gap-1.5"
        style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
      >
        <Wrench className="w-4 h-4" /> Log Maintenance
      </button>
    ) : (
      <span className="px-3 py-2 surface-inner text-tertiary rounded-lg text-xs flex items-center gap-1.5">
        <Eye className="w-3.5 h-3.5" /> View only
      </span>
    ),
  });

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={MAINTENANCE_VIEW_ROLES} moduleKey="maintenance">
    <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <MaintenanceDueSection canWrite={canWrite} />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Scheduled', value: scheduled, color: 'var(--accent)' },
            { label: 'In Progress', value: inProgress, color: 'var(--warning-text)' },
            { label: 'Overdue', value: overdue, color: 'var(--danger)' },
            { label: 'Total Cost', value: `₹${totalCost.toLocaleString('en-IN')}`, color: 'var(--success)' },
          ].map((stat, i) => (
            <div key={i} className="surface-inner p-4">
              <p className="text-xs text-tertiary">{stat.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: stat.color }}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]">
            <option value="ALL">All Status</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <select value={filterAircraft} onChange={e => setFilterAircraft(e.target.value)}
            className="surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]">
            <option value="ALL">All Aircraft</option>
            {aircraft.map(a => (
              <option key={a.id} value={a.id}>{a.registration}</option>
            ))}
          </select>
        </div>

        {/* Records */}
        <div className="surface-card p-6">
          {loadingMaintenance ? (
            <p className="text-secondary text-center py-8">Loading...</p>
          ) : filteredRecords.length === 0 ? (
            <p className="text-secondary text-center py-8">No maintenance records found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                    <th className="pb-3">Ticket #</th>
                    <th className="pb-3">Aircraft</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Scheduled</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Cost</th>
                    {canWrite && <th className="pb-3">Actions</th>}
                  </tr>
                </thead>
                <tbody className="text-secondary">
                  {filteredRecords.map(record => {
                    const isActive = record.status === 'SCHEDULED' || record.status === 'IN_PROGRESS';
                    const openEnded = isActive && !!record.maintenanceStart && !record.maintenanceEnd;
                    const statusBadgeClass = record.status === 'COMPLETED' ? 'badge-success' :
                      record.status === 'IN_PROGRESS' ? 'badge-warning' :
                      record.status === 'SCHEDULED' ? 'badge-accent' : 'badge-danger';
                    return (
                    <tr
                      key={record.id}
                      className="border-b"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)',
                        backgroundColor: record.isOverdue ? 'var(--danger-soft)' : undefined,
                      }}
                    >
                      <td className={`py-3 text-xs font-mono ${record.isSquawk ? '' : 'text-tertiary'}`} style={record.isSquawk ? { color: 'var(--warning-text)' } : undefined}>
                        {record.ticketNumber || '—'}
                      </td>
                      <td className="py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{record.aircraftReg}</td>
                      <td className="py-3 text-xs">{record.maintenanceType}</td>
                      <td className="py-3 text-xs">
                        {new Date(record.scheduledDate).toLocaleDateString('en-IN')}
                        {/* Precise window, when set — shows the actual blocked span instead of
                            just the scheduled day, so it's clear at a glance whether this is a
                            whole-day block or just a few hours. */}
                        {record.maintenanceStart && (
                          <p className="text-[11px] text-tertiary mt-0.5">
                            {formatISTDateTime(record.maintenanceStart)} → {record.maintenanceEnd ? formatISTDateTime(record.maintenanceEnd) : 'ongoing'}
                          </p>
                        )}
                        {openEnded && (
                          <span className="ml-1 flex items-center gap-1 text-[11px]" style={{ color: 'var(--warning-text)' }}>
                            <Hourglass className="w-3 h-3" /> open-ended
                          </span>
                        )}
                        {record.isOverdue && (
                          <span className="ml-1 flex items-center gap-1 text-[11px]" style={{ color: 'var(--danger)' }}>
                            <TriangleAlert className="w-3 h-3" /> OVERDUE
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        <span className={`badge ${statusBadgeClass}`}>{record.status.replace('_', ' ')}</span>
                      </td>
                      <td className="py-3">₹{record.cost.toLocaleString('en-IN')}</td>
                      {canWrite && (
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1">
                            {isActive && (
                              <button onClick={() => handleComplete(record)}
                                className="px-2 py-1 rounded text-xs flex items-center gap-1 transition" style={{ backgroundColor: 'var(--success-soft)', color: 'var(--success)' }}>
                                <Check className="w-3 h-3" /> Complete
                              </button>
                            )}
                            {/* Quick-extend — only meaningful once there's an end time to push
                                forward; an open-ended record has nothing to extend (use Edit to
                                set an end instead). Never auto-extends on its own — the aircraft
                                stays blocked (and overdue-flagged) either way until someone does. */}
                            {isActive && record.maintenanceEnd && (
                              <>
                                <button onClick={() => handleExtend(record, 4 * 60 * 60 * 1000)}
                                  className="px-2 py-1 rounded text-xs transition" style={{ backgroundColor: 'var(--warning-soft)', color: 'var(--warning-text)' }}>
                                  +4h
                                </button>
                                <button onClick={() => handleExtend(record, 24 * 60 * 60 * 1000)}
                                  className="px-2 py-1 rounded text-xs transition" style={{ backgroundColor: 'var(--warning-soft)', color: 'var(--warning-text)' }}>
                                  +1d
                                </button>
                              </>
                            )}
                            <button onClick={() => handleEdit(record)}
                              className="px-2 py-1 rounded text-xs transition" style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }} aria-label={`Edit ${record.aircraftReg} ${record.maintenanceType} record`}>
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button onClick={() => handleDeleteClick(record)}
                              className="px-2 py-1 rounded text-xs transition" style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }} aria-label={`Delete ${record.aircraftReg} ${record.maintenanceType} record`}>
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <MaintenanceForm
          record={editingRecord}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingRecord(null); }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete maintenance record?"
          message={`This will permanently delete the ${deleteTarget.maintenanceType} record for ${deleteTarget.aircraftReg}. This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </main>
    </RoleGate>
    </ProtectedRoute>
  );
}
