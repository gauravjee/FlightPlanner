// components/availability/AvailabilityForm.tsx
// Modal form for adding/editing leave/availability records for instructors and students
'use client';

import { useState, useEffect } from 'react';
import { useFlightStore } from '@/lib/store';
import { AvailabilityRecord } from '@/types';

interface Props {
  record: AvailabilityRecord | null;
  onSave: (record: Partial<AvailabilityRecord>) => void;
  onClose: () => void;
}

export default function AvailabilityForm({ record, onSave, onClose }: Props) {
  const { instructors, students } = useFlightStore();
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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700 sticky top-0 bg-slate-800 z-10 rounded-t-xl">
          <h3 className="text-lg font-semibold text-white">
            {isEditing ? '✏️ Edit Leave Record' : '🏖️ Add Leave / Unavailability'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg cursor-pointer">
            <span className="text-slate-400 text-xl">✕</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Person Type */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Person Type</label>
            <select
              value={form.personType}
              onChange={e => {
                setForm(p => ({ ...p, personType: e.target.value as 'instructor' | 'student', personId: '' }));
              }}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
            >
              <option value="instructor">Instructor</option>
              <option value="student">Student</option>
            </select>
          </div>

          {/* Person Selection */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              {form.personType === 'instructor' ? '👨‍🏫 Instructor' : '👨‍✈️ Student'} *
            </label>
            <select
              value={form.personId}
              onChange={e => setForm(p => ({ ...p, personId: e.target.value }))}
              required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
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
            <label className="block text-sm text-slate-400 mb-1">Leave Type</label>
            <select
              value={form.leaveType}
              onChange={e => setForm(p => ({ ...p, leaveType: e.target.value }))}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
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
              <label className="block text-sm text-slate-400 mb-1">Start Date *</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">End Date *</label>
              <input
                type="date"
                value={form.endDate}
                onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                min={form.startDate}
                required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
            </div>
          </div>

          {/* Time Range (optional) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Start Time (optional)</label>
              <input
                type="time"
                value={form.startTime}
                onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">End Time (optional)</label>
              <input
                type="time"
                value={form.endTime}
                onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
            </div>
          </div>
          <p className="text-xs text-slate-500 -mt-2">Leave blank for full-day absence</p>

          {/* Status */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Status</label>
            <select
              value={form.status}
              onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
            >
              <option value="APPROVED">Approved</option>
              <option value="PENDING">Pending</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Reason / Notes</label>
            <textarea
              value={form.reason}
              onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
              rows={2}
              placeholder="Reason for absence..."
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
            />
          </div>

          {/* Created By */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Created By</label>
            <input
              type="text"
              value={form.createdBy}
              onChange={e => setForm(p => ({ ...p, createdBy: e.target.value }))}
              placeholder="Your name"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
            />
          </div>

          {/* Buttons */}
          <div className="flex space-x-3 pt-4 border-t border-slate-700">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition cursor-pointer">
              Cancel
            </button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition cursor-pointer font-bold">
              {isEditing ? '💾 Save Changes' : '🏖️ Add Leave'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}