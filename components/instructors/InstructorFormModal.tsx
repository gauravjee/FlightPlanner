// components/instructors/InstructorFormModal.tsx
// Modal form for adding/editing instructors
'use client';

import { useState, useEffect } from 'react';
import { Instructor } from '@/types';
import { Pencil, GraduationCap, Save, X } from 'lucide-react';

interface Props {
  instructor: Instructor | null;
  onSave: (instructor: Instructor | Omit<Instructor, 'id'>) => void;
  onClose: () => void;
}

export default function InstructorFormModal({ instructor, onSave, onClose }: Props) {
  const isEditing = !!instructor;

  const [form, setForm] = useState({
    name: '',
    initials: '',
    licenseNumber: '',
    ratings: 'CFI',
    maxDailyHours: 8,
    email: '',
    phone: '',
    status: 'AVAILABLE' as Instructor['status'],
  });

  // Populate form when editing
  useEffect(() => {
    if (instructor) {
      setForm({
        name: instructor.name,
        initials: instructor.initials,
        licenseNumber: instructor.licenseNumber,
        ratings: instructor.ratings,
        maxDailyHours: instructor.maxDailyHours,
        email: instructor.email || '',
        phone: instructor.phone || '',
        status: instructor.status,
      });
    }
  }, [instructor]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.initials || !form.licenseNumber) return;
    onSave(form as Instructor);
    onClose();
  };

  const inputClass = "w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]";

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="surface-card w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            {isEditing ? <Pencil className="w-4 h-4" /> : <GraduationCap className="w-4 h-4" />}
            {isEditing ? 'Edit Instructor' : 'Add Instructor'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg cursor-pointer hover:opacity-80">
            <X className="w-5 h-5 text-tertiary" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-secondary mb-1">Name *</label>
              <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required
                className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">Initials *</label>
              <input type="text" value={form.initials} onChange={e => setForm(p => ({ ...p, initials: e.target.value.toUpperCase() }))} required maxLength={4}
                className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-secondary mb-1">License Number *</label>
              <input type="text" value={form.licenseNumber} onChange={e => setForm(p => ({ ...p, licenseNumber: e.target.value }))} required
                className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as Instructor['status'] }))}
                className={inputClass}>
                <option value="AVAILABLE">Available</option>
                <option value="FLYING">Flying</option>
                <option value="OFF_DUTY">Off Duty</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-secondary mb-1">Ratings (comma-separated)</label>
            <input type="text" value={form.ratings} onChange={e => setForm(p => ({ ...p, ratings: e.target.value }))}
              placeholder="CFI, CFII, MEI"
              className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-secondary mb-1">Max Daily Hours</label>
              <input type="number" value={form.maxDailyHours || ''} onChange={e => setForm(p => ({ ...p, maxDailyHours: parseInt(e.target.value) || 0 }))}
                min={1} max={12}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">Phone</label>
              <input type="text" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                className={inputClass} />
            </div>
          </div>

          <div>
            <label className="block text-xs text-secondary mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className={inputClass} />
          </div>

          <div className="flex space-x-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg transition cursor-pointer surface-inner">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 px-4 py-2 rounded-lg transition cursor-pointer font-semibold flex items-center justify-center gap-1.5"
              style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}>
              {isEditing ? <Save className="w-4 h-4" /> : <GraduationCap className="w-4 h-4" />}
              {isEditing ? 'Save Changes' : 'Add Instructor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
