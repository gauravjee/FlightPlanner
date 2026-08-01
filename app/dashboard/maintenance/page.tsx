// app/dashboard/maintenance/page.tsx
// Maintenance tracking page - view, add, complete maintenance records
'use client';

import Header from '@/components/ui/Header';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import { useState, useEffect } from 'react';
import { useFlightStore } from '@/lib/store';
import { MaintenanceRecord } from '@/types';
import MaintenanceForm from '@/components/maintenance/MaintenanceForm';
import Link from 'next/link';

export default function MaintenancePage() {
  const { 
    maintenanceRecords, loadingMaintenance, 
    loadMaintenanceRecords, addMaintenanceRecord, 
    updateMaintenanceRecord, removeMaintenanceRecord,
    loadAircraft, aircraft 
  } = useFlightStore();
  
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MaintenanceRecord | null>(null);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterAircraft, setFilterAircraft] = useState('ALL');

  useEffect(() => {
    loadAircraft();
    loadMaintenanceRecords();
  }, []);

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

  const handleComplete = (id: string) => {
    updateMaintenanceRecord(id, {
      status: 'COMPLETED',
      completedDate: new Date().toISOString().split('T')[0],
    });
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this maintenance record?')) {
      removeMaintenanceRecord(id);
    }
  };

  return (
    <ProtectedRoute>
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <Header 
        title="Maintenance Tracking" 
        subtitle="Aircraft maintenance records" 
        action={
          <button onClick={handleAdd} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition cursor-pointer font-bold">
            🔧 Log Maintenance
          </button>
        }
      />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Scheduled', value: scheduled, color: 'text-blue-400' },
            { label: 'In Progress', value: inProgress, color: 'text-yellow-400' },
            { label: 'Overdue', value: overdue, color: 'text-red-400' },
            { label: 'Total Cost', value: `₹${totalCost.toLocaleString('en-IN')}`, color: 'text-green-400' },
          ].map((stat, i) => (
            <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <p className="text-xs text-slate-400">{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white">
            <option value="ALL">All Status</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <select value={filterAircraft} onChange={e => setFilterAircraft(e.target.value)}
            className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white">
            <option value="ALL">All Aircraft</option>
            {aircraft.map(a => (
              <option key={a.id} value={a.id}>{a.registration}</option>
            ))}
          </select>
        </div>

        {/* Records */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
          {loadingMaintenance ? (
            <p className="text-slate-400 text-center py-8">Loading...</p>
          ) : filteredRecords.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No maintenance records found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="pb-3">Aircraft</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Scheduled</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Cost</th>
                    <th className="pb-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {filteredRecords.map(record => (
                    <tr key={record.id} className={`border-b border-slate-700/50 ${record.isOverdue ? 'bg-red-500/10' : ''}`}>
                      <td className="py-3 text-white font-medium">{record.aircraftReg}</td>
                      <td className="py-3 text-xs">{record.maintenanceType}</td>
                      <td className="py-3 text-xs">
                        {new Date(record.scheduledDate).toLocaleDateString('en-IN')}
                        {record.isOverdue && <span className="text-red-400 ml-1">⚠ OVERDUE</span>}
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          record.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' :
                          record.status === 'IN_PROGRESS' ? 'bg-yellow-500/20 text-yellow-400' :
                          record.status === 'SCHEDULED' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>{record.status.replace('_', ' ')}</span>
                      </td>
                      <td className="py-3">₹{record.cost.toLocaleString('en-IN')}</td>
                      <td className="py-3">
                        <div className="flex space-x-1">
                          {record.status === 'SCHEDULED' && (
                            <button onClick={() => handleComplete(record.id)}
                              className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs hover:bg-green-500/30">
                              ✓ Complete
                            </button>
                          )}
                          <button onClick={() => handleEdit(record)}
                            className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs hover:bg-blue-500/30">
                            ✏️
                          </button>
                          <button onClick={() => handleDelete(record.id)}
                            className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs hover:bg-red-500/30">
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
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
    </main>
    </ProtectedRoute>
  );
}