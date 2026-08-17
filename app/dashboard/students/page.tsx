// app/dashboard/students/page.tsx
'use client';

import Header from '@/components/ui/Header';
import ProtectedRoute from '@/components/ui/ProtectedRoute';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useFlightStore } from '@/lib/store';
import { StudentRecord } from '@/types';
import StudentCard from '@/components/students/StudentCard';
import StudentFormModal from '@/components/students/StudentFormModal';
import RoleGate from '@/components/ui/RoleGate';
import { Plus, Search, GraduationCap } from 'lucide-react';

// Creating a student also creates their login (POST /api/students), which
// is scoped server-side to admin/super_admin only — see
// lib/api-auth.ts's STUDENT_CREATION_ROLES. instructor/operations can still
// view this page and edit existing students; the "Add Student" button is
// hidden for them so they don't hit a 403 after filling out the form.
const CAN_CREATE_STUDENT_ROLES = ['admin', 'super_admin'];

export default function StudentsPage() {
  const { data: session } = useSession();
  const canCreateStudent = CAN_CREATE_STUDENT_ROLES.includes(session?.user?.role || '');
  const { students, loadingStudents, loadStudents, loadInstructors, addStudent, updateStudent, removeStudent } = useFlightStore();
  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState('ALL');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
  loadInstructors();  // Load instructors first
  loadStudents();     // Then load students (so instructor names can be looked up)
}, [loadInstructors, loadStudents]);

  const filteredStudents = students.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          s.enrollmentId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStage = stageFilter === 'ALL' || s.trainingStage === stageFilter;
    return matchesSearch && matchesStage;
  });

  const stats = {
    total: students.length,
    active: students.filter(s => s.status === 'ACTIVE').length,
    ppl: students.filter(s => s.trainingStage.includes('PPL')).length,
    cpl: students.filter(s => s.trainingStage === 'CPL').length,
    ir: students.filter(s => s.trainingStage === 'IR').length,
  };

  const handleAdd = () => {
    setEditingStudent(null);
    setShowForm(true);
  };

  const handleEdit = (s: StudentRecord) => {
    setEditingStudent(s);
    setShowForm(true);
  };

  const handleSave = async (student: StudentRecord | Omit<StudentRecord, 'id'>) => {
    if (editingStudent) {
      await updateStudent(editingStudent.id, student);
    } else {
      // Creating a student also creates their login (see /api/students
      // POST) — surface whether the welcome email went out, same pattern
      // as User Management's "create user" success message.
      const result = await addStudent(student as Omit<StudentRecord, 'id'>);
      if (!result.success) {
        alert('Error creating student: ' + (result.error || 'Unknown error'));
        return;
      }
      if (result.emailSent) {
        setSuccessMessage(`Student created! Welcome email sent to ${student.email}`);
      } else {
        setSuccessMessage(`Student created but email failed: ${result.emailMessage}. Password: ${result.password}`);
      }
    }
    // Reload data to reflect changes (including instructor assignment)
    await loadInstructors();
    await loadStudents();
    setShowForm(false);
    setEditingStudent(null);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to remove this student?')) {
      removeStudent(id);
    }
  };

  return (
    <ProtectedRoute>
    <RoleGate allowedRoles={['admin', 'instructor', 'super_admin', 'operations']}>
    <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      <Header
        title="Student Records"
        subtitle="Manage student pilots"
        action={
          canCreateStudent ? (
            <button
              onClick={handleAdd}
              className="px-4 py-2 rounded-lg transition cursor-pointer font-semibold text-sm flex items-center gap-1.5"
              style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
            >
              <Plus className="w-4 h-4" /> Add Student
            </button>
          ) : undefined
        }
/>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {successMessage && (
          <div className="rounded-lg p-3 mb-6" style={{ backgroundColor: 'var(--success-soft)', border: '1px solid var(--success)' }}>
            <p className="text-sm" style={{ color: 'var(--success)' }}>{successMessage}</p>
          </div>
        )}
        {loadingStudents ? (
          <div className="text-center py-20"><p className="text-secondary text-lg">Loading students...</p></div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              {[
                { label: 'Total', value: stats.total, color: 'var(--text-primary)' },
                { label: 'Active', value: stats.active, color: 'var(--success)' },
                { label: 'PPL', value: stats.ppl, color: 'var(--accent)' },
                { label: 'CPL', value: stats.cpl, color: 'var(--accent-strong)' },
                { label: 'IR', value: stats.ir, color: 'var(--warning-text)' },
              ].map((stat, i) => (
                <div key={i} className="surface-inner p-3 text-center">
                  <p className="text-xs text-tertiary">{stat.label}</p>
                  <p className="text-lg font-bold" style={{ color: stat.color }}>{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-tertiary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input type="text" placeholder="Search by name or enrollment ID..."
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="w-full surface-inner rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:border-[var(--accent)]" />
              </div>
              <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
                className="surface-inner rounded-lg px-4 py-2 focus:outline-none focus:border-[var(--accent)]">
                <option value="ALL">All Stages</option>
                <option value="PPL">PPL</option>
                <option value="PPL Phase 1">PPL Phase 1</option>
                <option value="PPL Phase 2">PPL Phase 2</option>
                <option value="CPL">CPL</option>
                <option value="IR">IR</option>
                <option value="MULTI">MULTI</option>
              </select>
            </div>

            {filteredStudents.length === 0 ? (
              <div className="text-center py-20">
                <GraduationCap className="w-10 h-10 text-tertiary mx-auto mb-4" />
                <p className="text-secondary text-lg">No students found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredStudents.map(s => (
                  <StudentCard key={s.id} student={s} onEdit={handleEdit} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showForm && (
        <StudentFormModal student={editingStudent} onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingStudent(null); }} />
      )}
    </main>
    </RoleGate>
    </ProtectedRoute>
  );
}
