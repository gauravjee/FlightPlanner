// components/students/StudentFormModal.tsx
'use client';

import { StudentRecord } from '@/types';
import { useState, useEffect, useMemo } from 'react';
import { useInstructors } from '@/lib/hooks/useInstructors';
import { useStudents } from '@/lib/hooks/useStudents';
import { supabase } from '@/lib/supabase-client';
import { Pencil, GraduationCap, Save, Plus, X, CircleCheck } from 'lucide-react';
import { useEscapeToClose } from '@/lib/useEscapeToClose';
import { todayIST } from '@/lib/ist';

interface Props {
  student: StudentRecord | null;
  onSave: (student: StudentRecord | Omit<StudentRecord, 'id'>) => void;
  onClose: () => void;
}

export default function StudentFormModal({ student, onSave, onClose }: Props) {
  useEscapeToClose(onClose);
  const { instructors } = useInstructors();
  const { students } = useStudents();
  const isEditing = !!student;

  // The parent only ever renders this modal conditionally ({showForm &&
  // <StudentFormModal .../>}), so `student` is fixed for this instance's
  // whole lifetime — a fresh mount happens every time it's opened for a
  // different student (or for Add New). That means the form can seed
  // straight from the prop in a lazy initializer instead of syncing it in
  // via an effect after the fact.
  const [form, setForm] = useState(() =>
    student
      ? {
          enrollmentId: student.enrollmentId,
          name: student.name,
          initials: student.initials,
          trainingStage: student.trainingStage,
          totalHours: student.totalHours,
          // '|| ''' matters here: student.medicalExpiry can be undefined
          // (or, before the lib/store.ts fix alongside this one, null) for a
          // student with no medical expiry on file, and feeding that
          // straight into this controlled input's value below (rather than
          // empty string) triggers React's "value prop on input should not
          // be null" warning (found via testing, 2026-08-25).
          medicalExpiry: student.medicalExpiry || '',
          email: student.email || '',
          phone: student.phone || '',
          dateOfBirth: student.dateOfBirth || '',
          joinedDate: student.joinedDate || '',
          status: student.status,
          assignedInstructorId: student.assignedInstructorId,
          splNumber: student.splNumber || '',
          splIssueDate: student.splIssueDate || '',
          splExpiryDate: student.splExpiryDate || '',
          medicalIssueDate: student.medicalIssueDate || '',
        }
      : {
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
          joinedDate: todayIST(),
          status: 'ACTIVE',
          assignedInstructorId: undefined as string | undefined,
          // Student Pilot License number (2026-08-20) — shown as the "License
          // Number" on the Breath Analyser Register when this student is the
          // person tested. Optional — not every student has flown solo yet.
          splNumber: '',
          // SPL issue/expiry dates (2026-08-20), paired with splNumber above.
          splIssueDate: '',
          splExpiryDate: '',
          // Medical (DGCA Class 1) issue date (2026-08-25), paired with
          // medicalExpiry above.
          medicalIssueDate: '',
        }
  );

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

  // An existing student is never re-derived (no initials-from-name
  // auto-fill kicks in for them); a brand-new one starts un-edited so
  // typing a name auto-generates initials until the user overrides it.
  const [initialsManuallyEdited, setInitialsManuallyEdited] = useState(!!student);

  // SPL Expiry auto-fill (2026-08-21): SPL validity is 10 years from issue.
  // Picking an Issue Date auto-fills Expiry Date, but Expiry Date stays
  // directly editable — same "auto until touched" pattern as the Initials
  // field above. Once the user (or existing saved data) has a real expiry
  // value, we stop overwriting it on further issue-date edits. An existing
  // student with a saved expiry date already on file starts "manually
  // edited" so a later issue-date edit won't clobber it.
  const [splExpiryManuallyEdited, setSplExpiryManuallyEdited] = useState(!!student?.splExpiryDate);

  // Medical Expiry auto-fill (2026-08-25): same "auto until touched"
  // pattern as SPL/CPL Expiry above, but the validity period isn't a flat
  // duration — it depends on the DGCA Class 1 medical rule, which is
  // age-based (see computeMedicalExpiry below). Requires both Date of
  // Birth and Medical Issue Date to be present; recomputes if either one
  // changes, as long as Medical Expiry hasn't been directly touched.
  const [medicalExpiryManuallyEdited, setMedicalExpiryManuallyEdited] = useState(!!student?.medicalExpiry);

  // Adds `years` calendar years to a 'YYYY-MM-DD' date string, then
  // subtracts one day, returning the same format. The license-validity
  // period is defined as "exactly `years` years, inclusive of the issue
  // date" — e.g. issued 2026-08-30 expires 2036-08-29, not 2036-08-30
  // (2026-08-25, per explicit user correction). Handles the Feb-29 edge
  // case by falling back to Feb 28 on a non-leap target year before the
  // day is subtracted (native Date rolls Feb 29 over to Mar 1 otherwise).
  //
  // 2026-08-25 bugfix (separate from the -1-day rule above): this used to
  // build the target date via `d.toISOString().split('T')[0]`, but
  // Date.toISOString() always converts to UTC first. For any timezone
  // ahead of UTC (e.g. IST, UTC+5:30 — this FTO's timezone), local
  // midnight is still the *previous* day in UTC, so the computed date came
  // out an extra calendar day early. Building the string directly from the
  // Date object's own local-time fields avoids the UTC round-trip
  // entirely.
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
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Adds `months` calendar months to a 'YYYY-MM-DD' date string, then
  // subtracts one day (same "inclusive of issue date" convention as
  // addYears above), returning the same format. Clamps to the last day of
  // the target month if the original day doesn't exist there (e.g.
  // 2026-08-31 + 6 months would naively land on 2027-03-03 via JS's own
  // month-overflow rollover — this clamps it to 2027-02-28/29 instead,
  // the standard "set to day 0 of the following month" trick).
  const addMonths = (dateStr: string, months: number): string => {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    const originalDay = d.getDate();
    d.setMonth(d.getMonth() + months);
    if (d.getDate() !== originalDay) {
      d.setDate(0);
    }
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Age (in whole years) as of `atDateStr`, given a 'YYYY-MM-DD' date of
  // birth. Returns null if either date is missing/invalid.
  const ageAtDate = (dobStr: string, atDateStr: string): number | null => {
    const dob = new Date(dobStr + 'T00:00:00');
    const at = new Date(atDateStr + 'T00:00:00');
    if (isNaN(dob.getTime()) || isNaN(at.getTime())) return null;
    let age = at.getFullYear() - dob.getFullYear();
    const hadBirthdayByAtDate =
      at.getMonth() > dob.getMonth() ||
      (at.getMonth() === dob.getMonth() && at.getDate() >= dob.getDate());
    if (!hadBirthdayByAtDate) age -= 1;
    return age;
  };

  // DGCA Class 1 medical validity (2026-08-25, per explicit user
  // confirmation, cross-checked against several DGCA/aviation-school
  // sources): 12 months from issue if the student was under 40 on the
  // issue date, 6 months if 40 or older — minus 1 day, same
  // inclusive-of-issue-date convention as SPL/CPL. Requires both a Date of
  // Birth and a Medical Issue Date; returns '' if either is missing.
  const computeMedicalExpiry = (dobStr: string, issueDateStr: string): string => {
    if (!dobStr || !issueDateStr) return '';
    const age = ageAtDate(dobStr, issueDateStr);
    if (age === null) return '';
    const validityMonths = age < 40 ? 12 : 6;
    return addMonths(issueDateStr, validityMonths);
  };

  const getExistingInitials = (): string[] => {
    return students
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
              <label className="block text-sm text-secondary mb-1">
                Date of Birth
                <span className="text-xs text-tertiary ml-1">(for medical validity)</span>
              </label>
              <input type="date" value={form.dateOfBirth} onChange={e => {
                  const dob = e.target.value;
                  handleChange('dateOfBirth', dob);
                  if (!medicalExpiryManuallyEdited && form.medicalIssueDate) {
                    handleChange('medicalExpiry', computeMedicalExpiry(dob, form.medicalIssueDate));
                  }
                }}
                className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-secondary mb-1">
                Medical Issue Date
                <span className="text-xs text-tertiary ml-1">(DGCA Class 1)</span>
              </label>
              <input type="date" value={form.medicalIssueDate} onChange={e => {
                  const issueDate = e.target.value;
                  handleChange('medicalIssueDate', issueDate);
                  if (!medicalExpiryManuallyEdited) {
                    handleChange('medicalExpiry', computeMedicalExpiry(form.dateOfBirth, issueDate));
                  }
                }}
                className={inputClass} />
              {!form.dateOfBirth && (
                <p className="text-xs mt-1" style={{ color: 'var(--warning-text)' }}>
                  Enter Date of Birth above to auto-calculate Medical Expiry.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">
                Medical Expiry
                <span className="text-xs text-tertiary ml-1">(auto: 12mo under 40 / 6mo 40+, DGCA Class 1)</span>
              </label>
              <input type="date" value={form.medicalExpiry} onChange={e => {
                  handleChange('medicalExpiry', e.target.value);
                  setMedicalExpiryManuallyEdited(true);
                }}
                className={inputClass} />
              {!medicalExpiryManuallyEdited && form.dateOfBirth && form.medicalIssueDate && (
                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--success)' }}>
                  <CircleCheck className="w-3 h-3" /> Auto-generated
                </p>
              )}
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
