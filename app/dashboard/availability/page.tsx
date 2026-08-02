// app/dashboard/availability/page.tsx
// Availability & Leave Management page with visual calendar
// Shows instructors and students who are on leave
'use client';

import { useState, useEffect } from 'react';
import { useFlightStore } from '@/lib/store';
import { AvailabilityRecord } from '@/types';
import Header from '@/components/ui/Header';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import AvailabilityForm from '@/components/availability/AvailabilityForm';

// ============================================================
// COLOR MAPS for leave types
// ============================================================
const leaveColors: Record<string, string> = {
  UNAVAILABLE: 'bg-gray-500/30 text-gray-300 border-gray-500/30',
  VACATION: 'bg-blue-500/30 text-blue-300 border-blue-500/30',
  SICK: 'bg-red-500/30 text-red-300 border-red-500/30',
  TRAINING: 'bg-yellow-500/30 text-yellow-300 border-yellow-500/30',
  PERSONAL: 'bg-purple-500/30 text-purple-300 border-purple-500/30',
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
    instructors, students, loadInstructors, loadStudents
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
      addAvailability(data as any);
    }
    setShowForm(false);
    setEditingRecord(null);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this leave record?')) {
      removeAvailability(id);
    }
  };

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <Header
          title="Availability & Leave"
          subtitle="Manage instructor and student leave records"
          action={
            <button onClick={handleAdd} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition cursor-pointer font-bold">
              🏖️ Add Leave
            </button>
          }
        />

        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Instructor Leaves', value: instructorLeaves, color: 'text-blue-400' },
              { label: 'Student Leaves', value: studentLeaves, color: 'text-green-400' },
              { label: 'Active Today', value: activeLeaves, color: 'text-yellow-400' },
            ].map((stat, i) => (
              <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                <p className="text-xs text-slate-400">{stat.label}</p>
                <p className={`text-2xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-4 py-2 rounded-lg text-sm transition ${filterType === 'ALL' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300'}`}
            >
              All
            </button>
            <button
              onClick={() => setFilterType('instructor')}
              className={`px-4 py-2 rounded-lg text-sm transition ${filterType === 'instructor' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300'}`}
            >
              👨‍🏫 Instructors
            </button>
            <button
              onClick={() => setFilterType('student')}
              className={`px-4 py-2 rounded-lg text-sm transition ${filterType === 'student' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300'}`}
            >
              👨‍✈️ Students
            </button>
          </div>

          {/* Leave Records */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">📋 Leave Records</h2>

            {loadingAvailability ? (
              <p className="text-slate-400 text-center py-8">Loading...</p>
            ) : filteredRecords.length === 0 ? (
              <p className="text-slate-400 text-center py-8">No leave records found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="pb-3">Person</th>
                      <th className="pb-3">Type</th>
                      <th className="pb-3">Leave</th>
                      <th className="pb-3">Dates</th>
                      <th className="pb-3">Reason</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    {filteredRecords.map(record => (
                      <tr key={record.id} className="border-b border-slate-700/50">
                        <td className="py-3">
                          <span className="text-white font-medium">{record.personName}</span>
                          <span className="text-xs text-slate-400 ml-2">({record.personInitials})</span>
                          <span className="text-xs text-slate-500 ml-1">
                            {record.personType === 'instructor' ? '👨‍🏫' : '👨‍✈️'}
                          </span>
                        </td>
                        <td className="py-3 text-xs">{record.personType}</td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${leaveColors[record.leaveType] || leaveColors.UNAVAILABLE}`}>
                            {leaveLabels[record.leaveType] || record.leaveType}
                          </span>
                        </td>
                        <td className="py-3 text-xs">
                          {new Date(record.startDate).toLocaleDateString('en-IN')}
                          {record.startDate !== record.endDate && (
                            <> → {new Date(record.endDate).toLocaleDateString('en-IN')}</>
                          )}
                          {record.startTime && (
                            <span className="block text-slate-500">{record.startTime} - {record.endTime || 'EOD'}</span>
                          )}
                        </td>
                        <td className="py-3 text-xs max-w-[150px] truncate">{record.reason || '—'}</td>
                        <td className="py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            record.status === 'APPROVED' ? 'bg-green-500/20 text-green-400' :
                            record.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {record.status}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex space-x-1">
                            <button onClick={() => handleEdit(record)} className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs hover:bg-blue-500/30">✏️</button>
                            <button onClick={() => handleDelete(record.id)} className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs hover:bg-red-500/30">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Leave Legend */}
          <div className="mt-6 bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <h3 className="text-sm font-medium text-slate-400 mb-3">Leave Types</h3>
            <div className="flex flex-wrap gap-3">
              {Object.entries(leaveLabels).map(([key, label]) => (
                <div key={key} className="flex items-center space-x-1.5">
                  <div className={`w-3 h-3 rounded ${leaveColors[key]?.split(' ')[0] || 'bg-gray-500'}`} />
                  <span className="text-xs text-slate-400">{label}</span>
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
    </ProtectedRoute>
  );
}