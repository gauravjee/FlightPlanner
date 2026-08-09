// components/students/StudentFormModal.tsx
'use client';

import { StudentRecord } from '@/types';
import { useState, useEffect } from 'react';
import { useFlightStore } from '@/lib/store';


interface Props {
  student: StudentRecord | null;
  onSave: (student: StudentRecord | Omit<StudentRecord, 'id'>) => void;
  onClose: () => void;
}

export default function StudentFormModal({ student, onSave, onClose }: Props) {
  const { instructors, loadInstructors } = useFlightStore(); 
  const isEditing = !!student;

    // Load instructors if not already loaded
      useEffect(() => {
        if (instructors.length === 0) {
          loadInstructors();
        }
      }, [instructors.length, loadInstructors]); 
  
  const [form, setForm] = useState({
    enrollmentId: '',
    name: '',
    initials: '',
    trainingStage: 'PPL',
    totalHours: 0,
    medicalExpiry: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    joinedDate: new Date().toISOString().split('T')[0],
    status: 'ACTIVE',
    assignedInstructorId: undefined as string | undefined,
  });

  const [initialsManuallyEdited, setInitialsManuallyEdited] = useState(false);

  useEffect(() => {
    if (student) {
      setForm({
        enrollmentId: student.enrollmentId,
        name: student.name,
        initials: student.initials,
        trainingStage: student.trainingStage,
        totalHours: student.totalHours,
        medicalExpiry: student.medicalExpiry,
        email: student.email || '',
        phone: student.phone || '',
        dateOfBirth: student.dateOfBirth || '',
        joinedDate: student.joinedDate || '',
        status: student.status,
        assignedInstructorId: student.assignedInstructorId,
      });
      setInitialsManuallyEdited(true);
    }
  }, [student]);

  const getExistingInitials = (): string[] => {
    const store = useFlightStore.getState();
    return store.students
      .filter(s => s.status === 'ACTIVE' && (!student || s.id !== student.id))
      .map(s => s.initials);
  };

  const generateInitials = (name: string): string => {
    if (!name.trim()) return '';
    
    const parts = name.trim().split(/\s+/);
    let initials = '';
    
    if (parts.length >= 2) {
      initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (parts.length === 1 && parts[0].length >= 2) {
      initials = parts[0].substring(0, 2).toUpperCase();
    } else {
      initials = parts[0].toUpperCase();
    }
    
    const existingInitials = getExistingInitials();
    if (existingInitials.includes(initials)) {
      let counter = 1;
      let newInitials = initials + counter;
      while (existingInitials.includes(newInitials)) {
        counter++;
        newInitials = initials + counter;
      }
      return newInitials;
    }
    
    return initials;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...form,
      assignedInstructorId: form.assignedInstructorId || undefined,
    } as StudentRecord);
    onClose();
  };

  const handleChange = (field: string, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-700 sticky top-0 bg-slate-800 rounded-t-xl">
          <h3 className="text-lg font-semibold text-white">
            {isEditing ? '✏️ Edit Student' : '👨‍✈️ Add New Student'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg cursor-pointer">
            <span className="text-slate-400 text-xl">✕</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Full Name *</label>
              <input 
                type="text" 
                value={form.name} 
                onChange={e => {
                  handleChange('name', e.target.value);
                  if (!initialsManuallyEdited) {
                    const newInitials = generateInitials(e.target.value);
                    handleChange('initials', newInitials);
                  }
                }}
                required
                placeholder="e.g., John Doe"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" 
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Initials * 
                <span className="text-xs text-slate-500 ml-1">(auto)</span>
              </label>
              <input 
                type="text" 
                value={form.initials} 
                onChange={e => {
                  handleChange('initials', e.target.value.toUpperCase());
                  setInitialsManuallyEdited(true);
                }}
                required 
                maxLength={4}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" 
              />
              {!initialsManuallyEdited && form.name && (
                <p className="text-xs text-green-400 mt-1">✓ Auto-generated</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Enrollment ID *</label>
              <input type="text" value={form.enrollmentId} onChange={e => handleChange('enrollmentId', e.target.value)} required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Training Stage</label>
              <select value={form.trainingStage} onChange={e => handleChange('trainingStage', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500">
                <option value="PPL">PPL</option>
                <option value="PPL Phase 1">PPL Phase 1</option>
                <option value="PPL Phase 2">PPL Phase 2</option>
                <option value="CPL">CPL</option>
                <option value="IR">IR</option>
                <option value="MULTI">MULTI</option>
              </select>
            </div>
          </div>
          {/* Assigned Instructor */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">👨‍🏫 Assigned Instructor</label>
            <select
              value={form.assignedInstructorId || ''}
              onChange={e => setForm(p => ({ ...p, assignedInstructorId: e.target.value || undefined }))}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">None (Unassigned)</option>
              {instructors.map(i => (
                <option key={i.id} value={i.id}>{i.name} ({i.initials})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Total Hours</label>
              <input type="number" value={form.totalHours || ''} onChange={e => handleChange('totalHours', parseFloat(e.target.value) || 0)}
                min={0} step="0.1"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Medical Expiry</label>
              <input type="date" value={form.medicalExpiry} onChange={e => handleChange('medicalExpiry', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => handleChange('email', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Phone</label>
              <input type="text" value={form.phone} onChange={e => handleChange('phone', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
            </div>
          </div>

          <div className="flex space-x-3 pt-4 border-t border-slate-700">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition cursor-pointer">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition cursor-pointer">
              {isEditing ? '💾 Save Changes' : '➕ Add Student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}