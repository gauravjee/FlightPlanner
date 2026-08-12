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
import Link from 'next/link';
import RoleGate from '@/components/ui/RoleGate';

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
        alert('❌ Error creating student: ' + (result.error || 'Unknown error'));
        return;
      }
      if (result.emailSent) {
        setSuccessMessage(`✅ Student created! Welcome email sent to ${student.email}`);
      } else {
        setSuccessMessage(`⚠️ Student created but email failed: ${result.emailMessage}. Password: ${result.password}`);
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
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <Header
        title="Student Records"
        subtitle="Manage student pilots"
        action={
          canCreateStudent ? (
            <button onClick={handleAdd} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition cursor-pointer font-bold">
              ➕ Add Student
            </button>
          ) : undefined
        }
/>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {successMessage && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 mb-6">
            <p className="text-sm text-green-400">{successMessage}</p>
          </div>
        )}
        {loadingStudents ? (
          <div className="text-center py-20"><p className="text-slate-400 text-lg">Loading students...</p></div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              {[
                { label: 'Total', value: stats.total, color: 'text-white' },
                { label: 'Active', value: stats.active, color: 'text-green-400' },
                { label: 'PPL', value: stats.ppl, color: 'text-blue-400' },
                { label: 'CPL', value: stats.cpl, color: 'text-purple-400' },
                { label: 'IR', value: stats.ir, color: 'text-cyan-400' },
              ].map((stat, i) => (
                <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-400">{stat.label}</p>
                  <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <input type="text" placeholder="🔍 Search by name or enrollment ID..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
                className="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
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
                <p className="text-6xl mb-4">👨‍✈️</p>
                <p className="text-slate-400 text-lg">No students found</p>
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