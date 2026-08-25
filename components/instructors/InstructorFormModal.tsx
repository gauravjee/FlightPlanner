// components/instructors/InstructorFormModal.tsx
// Modal form for adding/editing instructors
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Instructor } from '@/types';
import { Pencil, GraduationCap, Save, X, CalendarCheck } from 'lucide-react';
import { useEscapeToClose } from '@/lib/useEscapeToClose';

interface Props {
  instructor: Instructor | null;
  onSave: (instructor: Instructor | Omit<Instructor, 'id'>) => void;
  onClose: () => void;
}

export default function InstructorFormModal({ instructor, onSave, onClose }: Props) {
  useEscapeToClose(onClose);
  const isEditing = !!instructor;
  const { data: session } = useSession();
  // Granting self-booking is a super_admin-only action (see
  // requireScheduleCreateAccess() in lib/api-auth.ts) — admin can otherwise
  // manage instructors, but this one field is more sensitive since it
  // controls who can create new Schedule bookings unsupervised.
  const isSuperAdmin = session?.user?.role === 'super_admin';

  const [form, setForm] = useState({
    name: '',
    initials: '',
    licenseNumber: '',
    // CPL issue/expiry dates (2026-08-20), paired with licenseNumber above.
    licenseIssueDate: '',
    licenseExpiryDate: '',
    ratings: 'CFI',
    maxDailyHours: 8,
    email: '',
    phone: '',
    status: 'AVAILABLE' as Instructor['status'],
    canSelfBook: false,
  });

  // CPL Expiry auto-fill (2026-08-21): CPL validity is 10 years from issue.
  // Picking an Issue Date auto-fills Expiry Date, but Expiry Date stays
  // directly editable — once touched (or already on file for an existing
  // instructor), further issue-date edits won't overwrite it.
  const [licenseExpiryManuallyEdited, setLicenseExpiryManuallyEdited] = useState(false);

  // 2026-08-25 bugfix: see the identical fix + explanation in
  // components/students/StudentFormModal.tsx's addYears — this was a
  // duplicated copy of the same helper with the same UTC-round-trip bug via
  // toISOString(), which understates the expiry date by one day in any
  // timezone ahead of UTC (including this FTO's, IST/UTC+5:30).
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
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Populate form when editing
  useEffect(() => {
    if (instructor) {
      setForm({
        name: instructor.name,
        initials: instructor.initials,
        licenseNumber: instructor.licenseNumber,
        licenseIssueDate: instructor.licenseIssueDate || '',
        licenseExpiryDate: instructor.licenseExpiryDate || '',
        ratings: instructor.ratings,
        maxDailyHours: instructor.maxDailyHours,
        email: instructor.email || '',
        phone: instructor.phone || '',
        status: instructor.status,
        canSelfBook: !!instructor.canSelfBook,
      });
      setLicenseExpiryManuallyEdited(!!instructor.licenseExpiryDate);
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
          <button onClick={onClose} className="p-2 rounded-lg cursor-pointer hover:opacity-80" aria-label="Close">
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
              <label className="block text-xs text-secondary mb-1">
                License Number * <span className="text-tertiary">(CPL)</span>
              </label>
              <input type="text" value={form.licenseNumber} onChange={e => setForm(p => ({ ...p, licenseNumber: e.target.value }))} required
                className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">Ratings (comma-separated)</label>
              <input type="text" value={form.ratings} onChange={e => setForm(p => ({ ...p, ratings: e.target.value }))}
                placeholder="CFI, CFII, MEI"
                className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-secondary mb-1">CPL Issue Date</label>
              <input type="date" value={form.licenseIssueDate} onChange={e => {
                  const issueDate = e.target.value;
                  setForm(p => ({
                    ...p,
                    licenseIssueDate: issueDate,
                    licenseExpiryDate: licenseExpiryManuallyEdited
                      ? p.licenseExpiryDate
                      : (issueDate ? addYears(issueDate, 10) : ''),
                  }));
                }}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">
                CPL Expiry Date
                <span className="text-tertiary ml-1">(auto: issue + 10y)</span>
              </label>
              <input type="date" value={form.licenseExpiryDate} onChange={e => {
                  setForm(p => ({ ...p, licenseExpiryDate: e.target.value }));
                  setLicenseExpiryManuallyEdited(true);
                }}
                className={inputClass} />
              {!licenseExpiryManuallyEdited && form.licenseIssueDate && (
                <p className="text-xs mt-1" style={{ color: 'var(--success)' }}>Auto-generated</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-secondary mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as Instructor['status'] }))}
                className={inputClass}>
                <option value="AVAILABLE">Available</option>
                <option value="FLYING">Flying</option>
                <option value="OFF_DUTY">Off Duty</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">Max Daily Hours</label>
              <input type="number" value={form.maxDailyHours || ''} onChange={e => setForm(p => ({ ...p, maxDailyHours: parseInt(e.target.value) || 0 }))}
                min={1} max={12}
                className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-secondary mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">Phone</label>
              <input type="text" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                className={inputClass} />
            </div>
          </div>

          {/* Self-booking permission — only meaningful once the instructor
              already exists (a brand-new instructor's can_self_book always
              defaults to false server-side, see app/api/instructors/route.ts),
              and only a super_admin may grant it. */}
          {isEditing && isSuperAdmin && (
            <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--surface-muted)' }}>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.canSelfBook}
                  onChange={e => setForm(p => ({ ...p, canSelfBook: e.target.checked }))}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    <CalendarCheck className="w-3.5 h-3.5" /> Allow self-booking
                  </span>
                  <span className="block text-xs text-tertiary mt-0.5">
                    Lets this instructor create their own new Schedule bookings, without
                    needing an admin/super_admin/operations user to book it for them.
                    Doesn&apos;t affect viewing the Schedule or editing/cancelling flights
                    already assigned to them.
                  </span>
                </span>
              </label>
            </div>
          )}

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
