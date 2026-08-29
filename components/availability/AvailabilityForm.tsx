// components/availability/AvailabilityForm.tsx
// Modal form for adding/editing leave/availability records for instructors and students
'use client';

import { useState, useEffect } from 'react';
import { useInstructors } from '@/lib/hooks/useInstructors';
import { useStudents } from '@/lib/hooks/useStudents';
import { AvailabilityRecord } from '@/types';
import { Palmtree, Pencil, Save, X, GraduationCap, Plane } from 'lucide-react';
import { useEscapeToClose } from '@/lib/useEscapeToClose';

interface Props {
  record: AvailabilityRecord | null;
  onSave: (record: Partial<AvailabilityRecord>) => void;
  onClose: () => void;
}

export default function AvailabilityForm({ record, onSave, onClose }: Props) {
  useEscapeToClose(onClose);
  const { instructors } = useInstructors();
  const { students } = useStudents();
  const isEditing = !!record;

  const today = new Date().toLocaleDateString('en-CA');

  const [form, setForm] = useState({
    personType: 'instructor' as 'instructor' | 'student',
    personId: '',
    leaveType: 'UNAVAILABLE',
    startDate: today,
    endDate: today,
    startTime: '',
    endTime: '',
    reason: '',
    status: 'APPROVED',
    createdBy: '',
  });

  // Populate form when editing
  useEffect(() => {
    if (record) {
      setForm({
        personType: record.personType,
        personId: record.personId,
        leaveType: record.leaveType,
        startDate: record.startDate,
        endDate: record.endDate,
        startTime: record.startTime || '',
        endTime: record.endTime || '',
        reason: record.reason,
        status: record.status,
        createdBy: record.createdBy || '',
      });
    }
  }, [record]);

  // Get the list of people based on selected type
  const people = form.personType === 'instructor' ? instructors : students;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.personId) return;
    onSave(form);
    onClose();
  };

  const inputClass = "w-full surface-inner rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--accent)]";

  return (
    <div
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div className="surface-card w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 z-10" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            {isEditing ? <><Pencil className="w-4 h-4" /> Edit Leave Record</> : <><Palmtree className="w-4 h-4" /> Add Leave / Unavailability</>}
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg cursor-pointer hover:opacity-80" aria-label="Close">
            <X className="w-5 h-5 text-tertiary" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Person Type */}
          <div>
            <label className="block text-sm text-secondary mb-1">Person Type</label>
            <select
              value={form.personType}
              onChange={e => {
                setForm(p => ({ ...p, personType: e.target.value as 'instructor' | 'student', personId: '' }));
              }}
              className={inputClass}
            >
              <option value="instructor">Instructor</option>
              <option value="student">Student</option>
            </select>
          </div>

          {/* Person Selection */}
          <div>
            <label className="block text-sm text-secondary mb-1 flex items-center gap-1.5">
              {form.personType === 'instructor' ? <GraduationCap className="w-3.5 h-3.5" /> : <Plane className="w-3.5 h-3.5" />}
              {form.personType === 'instructor' ? 'Instructor' : 'Student'} *
            </label>
            <select
              value={form.personId}
              onChange={e => setForm(p => ({ ...p, personId: e.target.value }))}
              required
              className={inputClass}
            >
              <option value="">Select {form.personType}</option>
              {people.map(person => (
                <option key={person.id} value={person.id}>
                  {person.name} ({person.initials})
                </option>
              ))}
            </select>
          </div>

          {/* Leave Type */}
          <div>
            <label className="block text-sm text-secondary mb-1">Leave Type</label>
            <select
              value={form.leaveType}
              onChange={e => setForm(p => ({ ...p, leaveType: e.target.value }))}
              className={inputClass}
            >
              <option value="UNAVAILABLE">Unavailable</option>
              <option value="VACATION">Vacation</option>
              <option value="SICK">Sick Leave</option>
              <option value="TRAINING">Training</option>
              <option value="PERSONAL">Personal</option>
            </select>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-secondary mb-1">Start Date *</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">End Date *</label>
              <input
                type="date"
                value={form.endDate}
                onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                min={form.startDate}
                required
                className={inputClass}
              />
            </div>
          </div>

          {/* Time Range (optional) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-secondary mb-1">Start Time (optional)</label>
              <input
                type="time"
                value={form.startTime}
                onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">End Time (optional)</label>
              <input
                type="time"
                value={form.endTime}
                onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
          <p className="text-xs text-tertiary -mt-2">Leave blank for full-day absence</p>

          {/* Status */}
          <div>
            <label className="block text-sm text-secondary mb-1">Status</label>
            <select
              value={form.status}
              onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
              className={inputClass}
            >
              <option value="APPROVED">Approved</option>
              <option value="PENDING">Pending</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm text-secondary mb-1">Reason / Notes</label>
            <textarea
              value={form.reason}
              onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
              rows={2}
              placeholder="Reason for absence..."
              className={inputClass}
            />
          </div>

          {/* Created By */}
          <div>
            <label className="block text-sm text-secondary mb-1">Created By</label>
            <input
              type="text"
              value={form.createdBy}
              onChange={e => setForm(p => ({ ...p, createdBy: e.target.value }))}
              placeholder="Your name"
              className={inputClass}
            />
          </div>

          {/* Buttons */}
          <div className="flex space-x-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg transition cursor-pointer surface-inner">
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 rounded-lg transition cursor-pointer font-semibold flex items-center justify-center gap-1.5"
              style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
            >
              {isEditing ? <><Save className="w-4 h-4" /> Save Changes</> : <><Palmtree className="w-4 h-4" /> Add Leave</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
