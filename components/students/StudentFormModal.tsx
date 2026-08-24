// components/students/StudentFormModal.tsx
'use client';

import { StudentRecord } from '@/types';
import { useState, useEffect, useMemo } from 'react';
import { useFlightStore } from '@/lib/store';
import { supabase } from '@/lib/supabase-client';
import { Pencil, GraduationCap, Save, Plus, X, CircleCheck } from 'lucide-react';
import { useEscapeToClose } from '@/lib/useEscapeToClose';

interface Props {
  student: StudentRecord | null;
  onSave: (student: StudentRecord | Omit<StudentRecord, 'id'>) => void;
  onClose: () => void;
}

export default function StudentFormModal({ student, onSave, onClose }: Props) {
  useEscapeToClose(onClose);
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
    // 2026-08-19: no longer defaults to a hardcoded 'PPL' — that assumed a
    // program that may not actually be configured. Starts unset; the
    // Training Stage field below requires an explicit choice from
    // whatever's really in training_programs (see stageOptions).
    trainingStage: '',
    totalHours: 0,
    medicalExpiry: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    joinedDate: new Date().toISOString().split('T')[0],
    status: 'ACTIVE',
    assignedInstructorId: undefined as string | undefined,
    // Student Pilot License number (2026-08-20) — shown as the "License
    // Number" on the Breath Analyser Register when this student is the
    // person tested. Optional — not every student has flown solo yet.
    splNumber: '',
    // SPL issue/expiry dates (2026-08-20), paired with splNumber above.
    splIssueDate: '',
    splExpiryDate: '',
  });

  // Training-stage options come entirely from Admin Setup -> Training
  // Programs — no hardcoded fallback list. This used to start from a fixed
  // 6-value list (PPL, PPL Phase 1, PPL Phase 2, CPL, IR, MULTI) merged
  // with the database, which caused real confusion: it was impossible to
  // tell, just by looking at the dropdown, which values were genuinely
  // configured programs and which were placeholder defaults nobody had
  // actually set up (2026-08-19: this is exactly what happened with "PPL
  // Phase 1"/"PPL Phase 2"/"MULTI" showing up despite training_programs
  // only having PPL/CPL/IR/SPL rows). Now it only ever shows what's real.
  const [stageOptions, setStageOptions] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('training_programs')
        .select('program_code, program_name, is_active, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) {
        console.error('Error loading training programs for stage dropdown:', error.message);
        return;
      }
      const dbValues = (data || [])
        .map(p => p.program_code || p.program_name)
        .filter((v): v is string => !!v);
      setStageOptions(dbValues);
    })();
  }, []);

  // Always keep whatever's currently selected/being edited in the list,
  // even if it doesn't match any configured program (e.g. legacy data
  // predating a program being renamed or removed). This isn't a hardcoded
  // list — it's just reflecting the real value on the record, so it never
  // disappears out from under an in-progress edit. Derived at render time
  // (not a second setState-in-effect) since it only ever adds one value.
  const visibleStageOptions = useMemo(() => {
    const current = form.trainingStage || student?.trainingStage;
    if (current && !stageOptions.includes(current)) {
      return [...stageOptions, current];
    }
    return stageOptions;
  }, [stageOptions, form.trainingStage, student]);

  const [initialsManuallyEdited, setInitialsManuallyEdited] = useState(false);

  // SPL Expiry auto-fill (2026-08-21): SPL validity is 10 years from issue.
  // Picking an Issue Date auto-fills Expiry Date, but Expiry Date stays
  // directly editable — same "auto until touched" pattern as the Initials
  // field above. Once the user (or existing saved data) has a real expiry
  // value, we stop overwriting it on further issue-date edits.
  const [splExpiryManuallyEdited, setSplExpiryManuallyEdited] = useState(false);

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
        splNumber: student.splNumber || '',
        splIssueDate: student.splIssueDate || '',
        splExpiryDate: student.splExpiryDate || '',
      });
      setInitialsManuallyEdited(true);
      // Existing student with a saved expiry date already on file — treat
      // it as manually set so editing Issue Date later won't clobber it.
      setSplExpiryManuallyEdited(!!student.splExpiryDate);
    }
  }, [student]);

  // Adds `years` calendar years to a 'YYYY-MM-DD' date string, returning the
  // same format. Handles the Feb-29 edge case by falling back to Feb 28 on
  // a non-leap target year (native Date rolls that over to Mar 1 otherwise).
  const addYears = (dateStr: string, years: number): string => {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    const targetYear = d.getFullYear() + years;
    const isFeb29 = d.getMonth() === 1 && d.getDate() === 29;
    const isTargetLeap = (targetYear % 4 === 0 && targetYear % 100 !== 0) || targetYear % 400 === 0;
    d.setFullYear(targetYear);
    if (isFeb29 && !isTargetLeap) {
      d.setMonth(1, 28);
    }
    return d.toISOString().split('T')[0];
  };

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

  const inputClass = "w-full surface-inner rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--accent)]";

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="surface-card w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b sticky top-0 rounded-t-xl" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            {isEditing ? <Pencil className="w-4 h-4" /> : <GraduationCap className="w-4 h-4" />}
            {isEditing ? 'Edit Student' : 'Add New Student'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg cursor-pointer hover:opacity-80" aria-label="Close">
            <X className="w-5 h-5 text-tertiary" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-secondary mb-1">Full Name *</label>
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
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">
                Initials *
                <span className="text-xs text-tertiary ml-1">(auto)</span>
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
                className={inputClass}
              />
              {!initialsManuallyEdited && form.name && (
                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--success)' }}>
                  <CircleCheck className="w-3 h-3" /> Auto-generated
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-secondary mb-1">Enrollment ID *</label>
              <input type="text" value={form.enrollmentId} onChange={e => handleChange('enrollmentId', e.target.value)} required
                className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Training Stage {!isEditing && '*'}</label>
              {visibleStageOptions.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--warning-text)' }}>
                  No training programs configured yet — add one in Admin Setup → Training Programs first.
                </p>
              ) : (
                <select value={form.trainingStage} onChange={e => handleChange('trainingStage', e.target.value)}
                  required={!isEditing} className={inputClass}>
                  {!form.trainingStage && <option value="" disabled>Select a stage...</option>}
                  {visibleStageOptions.map(stage => (
                    <option key={stage} value={stage}>{stage}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
          {/* Assigned Instructor */}
          <div>
            <label className="block text-xs text-secondary mb-1 flex items-center gap-1">
              <GraduationCap className="w-3.5 h-3.5" /> Assigned Instructor
            </label>
            <select
              value={form.assignedInstructorId || ''}
              onChange={e => setForm(p => ({ ...p, assignedInstructorId: e.target.value || undefined }))}
              className={`${inputClass} text-sm`}
            >
              <option value="">None (Unassigned)</option>
              {instructors.map(i => (
                <option key={i.id} value={i.id}>{i.name} ({i.initials})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-secondary mb-1">Total Hours</label>
              <input type="number" value={form.totalHours || ''} onChange={e => handleChange('totalHours', parseFloat(e.target.value) || 0)}
                min={0} step="0.1"
                className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Medical Expiry</label>
              <input type="date" value={form.medicalExpiry} onChange={e => handleChange('medicalExpiry', e.target.value)}
                className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-secondary mb-1">
                SPL Number
                <span className="text-xs text-tertiary ml-1">(Student Pilot License)</span>
              </label>
              <input type="text" value={form.splNumber} onChange={e => handleChange('splNumber', e.target.value)}
                placeholder="e.g., SPL-2026-0142"
                className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">SPL Issue Date</label>
              <input type="date" value={form.splIssueDate} onChange={e => {
                  const issueDate = e.target.value;
                  handleChange('splIssueDate', issueDate);
                  if (!splExpiryManuallyEdited) {
                    handleChange('splExpiryDate', issueDate ? addYears(issueDate, 10) : '');
                  }
                }}
                className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-secondary mb-1">
                SPL Expiry Date
                <span className="text-xs text-tertiary ml-1">(auto: issue + 10y)</span>
              </label>
              <input type="date" value={form.splExpiryDate} onChange={e => {
                  handleChange('splExpiryDate', e.target.value);
                  setSplExpiryManuallyEdited(true);
                }}
                className={inputClass} />
              {!splExpiryManuallyEdited && form.splIssueDate && (
                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--success)' }}>
                  <CircleCheck className="w-3 h-3" /> Auto-generated
                </p>
              )}
            </div>
            <div />
          </div>
          <p className="text-xs text-tertiary -mt-1">
            SPL Number is shown as this student&apos;s License Number on the Breath Analyser Register. Leave these fields blank until they&apos;ve been issued an SPL.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-secondary mb-1">
                Email {!isEditing && '*'}
              </label>
              <input type="email" value={form.email} onChange={e => handleChange('email', e.target.value)}
                required={!isEditing}
                className={inputClass} />
              {!isEditing && (
                <p className="text-xs text-tertiary mt-1">
                  This becomes the student&apos;s login — a password is generated and emailed to them.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Phone</label>
              <input type="text" value={form.phone} onChange={e => handleChange('phone', e.target.value)}
                className={inputClass} />
            </div>
          </div>

          <div className="flex space-x-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg transition cursor-pointer surface-inner">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 px-4 py-2 rounded-lg transition cursor-pointer font-semibold flex items-center justify-center gap-1.5"
              style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}>
              {isEditing ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {isEditing ? 'Save Changes' : 'Add Student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
