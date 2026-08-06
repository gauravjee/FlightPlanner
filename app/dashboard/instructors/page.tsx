// app/dashboard/instructors/page.tsx
// Instructor management page - view, add, edit, delete instructors
'use client';

import { useState, useEffect } from 'react';
import { useFlightStore } from '@/lib/store';
import { Instructor } from '@/types';
import InstructorCard from '@/components/instructors/InstructorCard';
import InstructorFormModal from '@/components/instructors/InstructorFormModal';
import Link from 'next/link';
import Header from '@/components/ui/Header';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';

export default function InstructorsPage() {
  const { instructors, loadInstructors, addInstructor, updateInstructor, removeInstructor } = useFlightStore();
  const [showForm, setShowForm] = useState(false);
  const [editingInstructor, setEditingInstructor] = useState<Instructor | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Load instructors from database on page mount
  useEffect(() => {
    loadInstructors();
  }, [loadInstructors]);

  // Filter instructors based on search and status
  const filteredInstructors = instructors.filter(i => {
    const matchesSearch = i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          i.licenseNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || i.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate stats
  const stats = {
    total: instructors.length,
    available: instructors.filter(i => i.status === 'AVAILABLE').length,
    flying: instructors.filter(i => i.status === 'FLYING').length,
    offDuty: instructors.filter(i => i.status === 'OFF_DUTY').length,
  };

  const handleAdd = () => {
    setEditingInstructor(null);
    setShowForm(true);
  };

  const handleEdit = (instructor: Instructor) => {
    setEditingInstructor(instructor);
    setShowForm(true);
  };

  const handleSave = (instructor: Instructor | Omit<Instructor, 'id'>) => {
    if (editingInstructor) {
      updateInstructor(editingInstructor.id, instructor);
    } else {
      addInstructor(instructor as Omit<Instructor, 'id'>);
    }
    setShowForm(false);
    setEditingInstructor(null);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Remove this instructor?')) {
      removeInstructor(id);
    }
  };

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={['admin', 'instructor', 'super_admin']}>
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <Header 
      title="Instructors" 
      subtitle="Manage flight instructors" 
      action={
        <button onClick={handleAdd} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition cursor-pointer font-bold">
          👨‍🏫 Add Instructor
        </button>
      }
    />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total', value: stats.total, color: 'text-white' },
            { label: 'Available', value: stats.available, color: 'text-green-400' },
            { label: 'Flying', value: stats.flying, color: 'text-blue-400' },
            { label: 'Off Duty', value: stats.offDuty, color: 'text-slate-400' },
          ].map((stat, i) => (
            <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <p className="text-xs text-slate-400">{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Search & Filter */}
        <div className="flex gap-3 mb-6">
          <input type="text" placeholder="🔍 Search by name or license..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-white">
            <option value="ALL">All Status</option>
            <option value="AVAILABLE">Available</option>
            <option value="FLYING">Flying</option>
            <option value="OFF_DUTY">Off Duty</option>
          </select>
        </div>

        {/* Instructor Cards */}
        {filteredInstructors.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-6xl mb-4">👨‍🏫</p>
            <p className="text-slate-400 text-lg">No instructors found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredInstructors.map(i => (
              <InstructorCard key={i.id} instructor={i} onEdit={handleEdit} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <InstructorFormModal instructor={editingInstructor} onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingInstructor(null); }} />
      )}
    </main>
    </RoleGate>
    </ProtectedRoute>
  );
}