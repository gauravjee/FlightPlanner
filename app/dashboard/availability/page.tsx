// app/dashboard/availability/page.tsx
// Availability & Leave Management page with visual calendar
// Shows instructors and students who are on leave
'use client';

import { useState, useEffect } from 'react';
import { useFlightStore } from '@/lib/store';
import { AvailabilityRecord } from '@/types';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import AvailabilityForm from '@/components/availability/AvailabilityForm';
import RoleGate from '@/components/ui/RoleGate';
import { AVAILABILITY_VIEW_ROLES } from '@/lib/permissions';
import { Palmtree, GraduationCap, Plane, ClipboardList, Pencil, Trash2 } from 'lucide-react';

// ============================================================
// COLOR MAPS for leave types — mapped onto design tokens so the
// legend swatches and badges track light/dark theme correctly.
// ============================================================
const leaveColorVars: Record<string, string> = {
  UNAVAILABLE: 'var(--text-secondary)',
  VACATION: 'var(--accent)',
  SICK: 'var(--danger)',
  TRAINING: 'var(--warning-text)',
  PERSONAL: 'var(--accent-strong)',
};

const leaveLabels: Record<string, string> = {
  UNAVAILABLE: 'Unavailable',
  VACATION: 'Vacation',
  SICK: 'Sick',
  TRAINING: 'Training',
  PERSONAL: 'Personal',
};

export default function AvailabilityPage() {
  const {
    availabilityRecords, loadingAvailability,
    loadAvailability, addAvailability, updateAvailability, removeAvailability,
    loadInstructors, loadStudents
  } = useFlightStore();

  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AvailabilityRecord | null>(null);
  const [filterType, setFilterType] = useState<'ALL' | 'instructor' | 'student'>('ALL');

  // Load data on mount
  useEffect(() => {
    loadInstructors();
    loadStudents();
    loadAvailability();
  }, [loadInstructors, loadStudents, loadAvailability]);

  // Filter records
  const filteredRecords = availabilityRecords.filter(r => {
    if (filterType !== 'ALL' && r.personType !== filterType) return false;
    return true;
  });

  // Group records by person for the visual list
  const personMap = new Map<string, AvailabilityRecord[]>();
  filteredRecords.forEach(record => {
    const key = `${record.personType}-${record.personId}`;
    if (!personMap.has(key)) personMap.set(key, []);
    personMap.get(key)!.push(record);
  });

  // Stats
  const instructorLeaves = availabilityRecords.filter(r => r.personType === 'instructor').length;
  const studentLeaves = availabilityRecords.filter(r => r.personType === 'student').length;
  const activeLeaves = availabilityRecords.filter(r => {
    const today = new Date().toLocaleDateString('en-CA');
    return r.startDate <= today && r.endDate >= today && r.status === 'APPROVED';
  }).length;

  const handleAdd = () => {
    setEditingRecord(null);
    setShowForm(true);
  };

  const handleEdit = (record: AvailabilityRecord) => {
    setEditingRecord(record);
    setShowForm(true);
  };

  const handleSave = (data: Partial<AvailabilityRecord>) => {
    if (editingRecord) {
      updateAvailability(editingRecord.id, data);
    } else {
      addAvailability(data as Omit<AvailabilityRecord, 'id' | 'personName' | 'personInitials'>);
    }
    setShowForm(false);
    setEditingRecord(null);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this leave record?')) {
      removeAvailability(id);
    }
  };

  useSetHeader({
    title: 'Availability & Leave',
    subtitle: 'Manage instructor and student leave records',
    action: (
      <button
        onClick={handleAdd}
        className="px-4 py-2 rounded-lg transition cursor-pointer font-semibold text-sm flex items-center gap-1.5"
        style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
      >
        <Palmtree className="w-4 h-4" /> Add Leave
      </button>
    ),
  });

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={AVAILABILITY_VIEW_ROLES}>
      <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Instructor Leaves', value: instructorLeaves, color: 'var(--accent)' },
              { label: 'Student Leaves', value: studentLeaves, color: 'var(--success)' },
              { label: 'Active Today', value: activeLeaves, color: 'var(--warning-text)' },
            ].map((stat, i) => (
              <div key={i} className="surface-inner p-4">
                <p className="text-xs text-tertiary">{stat.label}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: stat.color }}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => setFilterType('ALL')}
              className="px-4 py-2 rounded-lg text-sm transition"
              style={filterType === 'ALL'
                ? { backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }
                : { backgroundColor: 'var(--surface-muted)', color: 'var(--text-secondary)' }}
            >
              All
            </button>
            <button
              onClick={() => setFilterType('instructor')}
              className="px-4 py-2 rounded-lg text-sm transition flex items-center gap-1.5"
              style={filterType === 'instructor'
                ? { backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }
                : { backgroundColor: 'var(--surface-muted)', color: 'var(--text-secondary)' }}
            >
              <GraduationCap className="w-3.5 h-3.5" /> Instructors
            </button>
            <button
              onClick={() => setFilterType('student')}
              className="px-4 py-2 rounded-lg text-sm transition flex items-center gap-1.5"
              style={filterType === 'student'
                ? { backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }
                : { backgroundColor: 'var(--surface-muted)', color: 'var(--text-secondary)' }}
            >
              <Plane className="w-3.5 h-3.5" /> Students
            </button>
          </div>

          {/* Leave Records */}
          <div className="surface-card p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-secondary" /> Leave Records
            </h2>

            {loadingAvailability ? (
              <p className="text-secondary text-center py-8">Loading...</p>
            ) : filteredRecords.length === 0 ? (
              <p className="text-secondary text-center py-8">No leave records found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                      <th className="pb-3">Person</th>
                      <th className="pb-3">Type</th>
                      <th className="pb-3">Leave</th>
                      <th className="pb-3">Dates</th>
                      <th className="pb-3">Reason</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-secondary">
                    {filteredRecords.map(record => {
                      const leaveColor = leaveColorVars[record.leaveType] || leaveColorVars.UNAVAILABLE;
                      const statusBadgeClass = record.status === 'APPROVED' ? 'badge-success' :
                        record.status === 'PENDING' ? 'badge-warning' : 'badge-danger';
                      return (
                      <tr key={record.id} className="border-b" style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
                        <td className="py-3">
                          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{record.personName}</span>
                          <span className="text-xs text-tertiary ml-2">({record.personInitials})</span>
                          <span className="text-xs text-tertiary ml-1 inline-flex align-middle">
                            {record.personType === 'instructor' ? <GraduationCap className="w-3 h-3" /> : <Plane className="w-3 h-3" />}
                          </span>
                        </td>
                        <td className="py-3 text-xs">{record.personType}</td>
                        <td className="py-3">
                          <span
                            className="badge"
                            style={{ backgroundColor: `color-mix(in srgb, ${leaveColor} 15%, transparent)`, color: leaveColor }}
                          >
                            {leaveLabels[record.leaveType] || record.leaveType}
                          </span>
                        </td>
                        <td className="py-3 text-xs">
                          {new Date(record.startDate).toLocaleDateString('en-IN')}
                          {record.startDate !== record.endDate && (
                            <> → {new Date(record.endDate).toLocaleDateString('en-IN')}</>
                          )}
                          {record.startTime && (
                            <span className="block text-tertiary">{record.startTime} - {record.endTime || 'EOD'}</span>
                          )}
                        </td>
                        <td className="py-3 text-xs max-w-[150px] truncate">{record.reason || '—'}</td>
                        <td className="py-3">
                          <span className={`badge ${statusBadgeClass}`}>
                            {record.status}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex space-x-1">
                            <button onClick={() => handleEdit(record)} className="px-2 py-1 rounded text-xs transition" style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}>
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button onClick={() => handleDelete(record.id)} className="px-2 py-1 rounded text-xs transition" style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Leave Legend */}
          <div className="mt-6 surface-card p-6">
            <h3 className="text-sm font-medium text-secondary mb-3">Leave Types</h3>
            <div className="flex flex-wrap gap-3">
              {Object.entries(leaveLabels).map(([key, label]) => (
                <div key={key} className="flex items-center space-x-1.5">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: leaveColorVars[key] || 'var(--text-secondary)' }} />
                  <span className="text-xs text-tertiary">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Add/Edit Modal */}
        {showForm && (
          <AvailabilityForm
            record={editingRecord}
            onSave={handleSave}
            onClose={() => { setShowForm(false); setEditingRecord(null); }}
          />
        )}
      </main>
      </RoleGate>
    </ProtectedRoute>
  );
}
