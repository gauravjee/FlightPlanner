// app/dashboard/instructors/page.tsx
// Instructor management page - view, add, edit, delete instructors
'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useInstructors, addInstructor, updateInstructor, removeInstructor } from '@/lib/hooks/useInstructors';
import { Instructor } from '@/types';
import InstructorCard from '@/components/instructors/InstructorCard';
import InstructorFormModal from '@/components/instructors/InstructorFormModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { INSTRUCTORS_VIEW_ROLES, canWriteModule } from '@/lib/permissions';
import { useMyPermissionOverrides } from '@/lib/useMyPermissionOverrides';
import { Search, GraduationCap } from 'lucide-react';

export default function InstructorsPage() {
  const { data: session } = useSession();
  const overrides = useMyPermissionOverrides();
  // Only admin/super_admin manage the roster by default (2026-08-17
  // role/tab matrix) — operations/instructor/maintenance can view/manage
  // it too if a super_admin has granted a per-user override.
  const canWrite = canWriteModule(session?.user?.role, overrides, 'instructors');
  const { instructors } = useInstructors();
  const [showForm, setShowForm] = useState(false);
  const [editingInstructor, setEditingInstructor] = useState<Instructor | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

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
    setDeleteTarget(id);
  };

  useSetHeader({
    title: 'Instructors',
    subtitle: 'Manage flight instructors',
    action: canWrite ? (
      <button
        onClick={handleAdd}
        className="px-4 py-2 rounded-lg transition cursor-pointer font-semibold text-sm flex items-center gap-1.5"
        style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
      >
        <GraduationCap className="w-4 h-4" /> Add Instructor
      </button>
    ) : undefined,
  });

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={INSTRUCTORS_VIEW_ROLES} moduleKey="instructors">
    <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total', value: stats.total, color: 'var(--text-primary)' },
            { label: 'Available', value: stats.available, color: 'var(--success)' },
            { label: 'Flying', value: stats.flying, color: 'var(--accent)' },
            { label: 'Off Duty', value: stats.offDuty, color: 'var(--text-secondary)' },
          ].map((stat, i) => (
            <div key={i} className="surface-inner p-4">
              <p className="text-xs text-tertiary">{stat.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: stat.color }}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Search & Filter */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-tertiary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" placeholder="Search by name or license..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full surface-inner rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:border-[var(--accent)]" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="surface-inner rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--accent)]">
            <option value="ALL">All Status</option>
            <option value="AVAILABLE">Available</option>
            <option value="FLYING">Flying</option>
            <option value="OFF_DUTY">Off Duty</option>
          </select>
        </div>

        {/* Instructor Cards */}
        {filteredInstructors.length === 0 ? (
          <div className="text-center py-20">
            <GraduationCap className="w-10 h-10 text-tertiary mx-auto mb-4" />
            <p className="text-secondary text-lg">No instructors found</p>
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

      {deleteTarget && (
        <ConfirmDialog
          title="Remove instructor?"
          message="Remove this instructor?"
          confirmLabel="Remove"
          onConfirm={() => { removeInstructor(deleteTarget); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </main>
    </RoleGate>
    </ProtectedRoute>
  );
}
