// components/instructors/InstructorFormModal.tsx
// Modal form for adding/editing instructors
'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Instructor } from '@/types';
import { Pencil, GraduationCap, Save, X, CalendarCheck } from 'lucide-react';
import { useEscapeToClose } from '@/lib/useEscapeToClose';
import { useFtoSettings } from '@/lib/hooks/useFtoSettings';
import { effectiveDailyLimit } from '@/lib/instructor-status';
import type { StaffMember } from '@/lib/staff-id';

interface Props {
  instructor: Instructor | null;
  onSave: (instructor: Instructor | Omit<Instructor, 'id'>) => void;
  onClose: () => void;
}

export default function InstructorFormModal({ instructor, onSave, onClose }: Props) {
  useEscapeToClose(onClose);
  const isEditing = !!instructor;
  const { data: session } = useSession();
  const { ftoSettings } = useFtoSettings();
  // Granting self-booking is a super_admin-only action (see
  // requireScheduleCreateAccess() in lib/api-auth.ts) — admin can otherwise
  // manage instructors, but this one field is more sensitive since it
  // controls who can create new Schedule bookings unsupervised.
  const isSuperAdmin = session?.user?.role === 'super_admin';
  // 2026-09-23: Active/Inactive is admin/super_admin only (server enforces
  // the same — see app/api/instructors/[id]/route.ts).
  const canSetEmployment = isSuperAdmin || session?.user?.role === 'admin';
  // 2026-09-24 (B2 S3a): a new instructor profile links to a staff record —
  // one without an instructor profile yet, or a new one. (Needs the Staff
  // list, i.e. admin / super admin; others can only add a new staff member.)
  const [freeStaff, setFreeStaff] = useState<StaffMember[]>([]);
  useEffect(() => {
    if (instructor) return;
    (async () => {
      const res = await fetch('/api/staff');
      const body = await res.json().catch(() => ({}));
      if (res.ok) setFreeStaff((body.staff as StaffMember[]).filter(s => s.instructorId === null));
    })();
  }, [instructor]);

  // The parent only ever renders this modal conditionally ({showForm &&
  // <InstructorFormModal .../>}), so `instructor` is fixed for this
  // instance's whole lifetime — a fresh mount happens every time it's
  // opened for a different instructor (or for Add New). That means the
  // form can seed straight from the prop in a lazy initializer instead of
  // syncing it in via an effect after the fact.
  const [form, setForm] = useState(() =>
    instructor
      ? {
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
          employmentStatus: instructor.employmentStatus ?? 'ACTIVE',
          staffMemberId: String(instructor.staffMemberId ?? ''), // not sent as a change (PATCH ignores it)
          newStaffJoiningDate: '',
        }
      : {
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
          employmentStatus: 'ACTIVE' as NonNullable<Instructor['employmentStatus']>,
          staffMemberId: '',        // '' = a new staff member (B2 S3a)
          newStaffJoiningDate: '',
        }
  );

  // CPL Expiry auto-fill (2026-08-21): CPL validity is 10 years from issue.
  // Picking an Issue Date auto-fills Expiry Date, but Expiry Date stays
  // directly editable — once touched (or already on file for an existing
  // instructor), further issue-date edits won't overwrite it. An existing
  // instructor with a saved expiry date already on file starts "manually
  // edited" so a later issue-date edit won't clobber it.
  const [licenseExpiryManuallyEdited, setLicenseExpiryManuallyEdited] = useState(!!instructor?.licenseExpiryDate);

  // 2026-08-25: see the identical helper + full explanation in
  // components/students/StudentFormModal.tsx's addYears —
  // (a) subtracts one day so the validity period is "exactly `years`
  // years, inclusive of the issue date" (e.g. issued 2026-08-30 expires
  // 2036-08-29, not 2036-08-30 — per explicit user correction), and
  // (b) builds the result from the Date object's own local-time fields
  // rather than `toISOString()`, which understates the date by one extra
  // day in any timezone ahead of UTC (including this FTO's, IST/UTC+5:30).
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.initials || !form.licenseNumber) return;
    onSave(form as Instructor);
    onClose();
  };

  const inputClass = "w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]";

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="surface-card w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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

          {/* 2026-09-23: the hand-set Status dropdown is gone — status is now
              computed (On leave / Flying / Limit reached / Off duty /
              Available; lib/instructor-status.ts). It also used to display
              "Available" for a stored value it didn't list and keep that
              value on save. Max Daily Hours shows the limit that applies. */}
          <div>
            <label className="block text-xs text-secondary mb-1">Max Daily Hours</label>
            <input type="number" value={form.maxDailyHours || ''} onChange={e => setForm(p => ({ ...p, maxDailyHours: parseInt(e.target.value) || 0 }))}
              min={1} max={12}
              className={inputClass} />
            <p className="text-xs text-tertiary mt-1">
              Limit that applies: {effectiveDailyLimit(form.maxDailyHours, ftoSettings['instructor_daily_limit_hours'])}h — the lower of
              this and the school ceiling ({effectiveDailyLimit(undefined, ftoSettings['instructor_daily_limit_hours'])}h, Admin Setup → FTO Settings).
              Bookings over it are refused.
            </p>
          </div>

          {/* 2026-09-24 (B2 S3a): dates live on the staff record. */}
          {instructor ? (
            <p className="text-xs text-tertiary">
              {instructor.staffId
                ? <>Staff ID <span className="font-mono">{instructor.staffId}</span>{instructor.joiningDate ? ` · joined ${instructor.joiningDate}` : ''}. </>
                : 'Not linked to a staff record. '}
              Joining date and last working day are set on the{' '}
              <a href="/dashboard/staff" className="hover:underline" style={{ color: 'var(--accent)' }}>Staff page</a>.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="instructor-staff" className="block text-xs text-secondary mb-1">Staff member *</label>
                <select id="instructor-staff" value={form.staffMemberId} className={inputClass}
                  onChange={e => {
                    const picked = freeStaff.find(s => String(s.id) === e.target.value);
                    setForm(p => ({ ...p, staffMemberId: e.target.value, name: picked ? picked.name : p.name }));
                  }}>
                  {/* Only admin / super admin may create a new staff record (operator, 24 Sep). */}
                  <option value="">{canSetEmployment ? '— New staff member —' : '— Pick a staff member —'}</option>
                  {freeStaff.map(s => <option key={s.id} value={s.id}>{s.name} · {s.staffId}</option>)}
                </select>
                {!canSetEmployment && (
                  <p className="text-xs text-tertiary mt-1">Only an admin or super admin can add a new staff member or see the staff list. Ask them to add this instructor.</p>
                )}
              </div>
              {form.staffMemberId === '' && canSetEmployment && (
                <div>
                  <label htmlFor="joining-date" className="block text-xs text-secondary mb-1">Joining date *</label>
                  <input id="joining-date" type="date" required value={form.newStaffJoiningDate}
                    onChange={e => setForm(p => ({ ...p, newStaffJoiningDate: e.target.value }))} className={inputClass} />
                </div>
              )}
            </div>
          )}

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

          {/* 2026-09-23: employment status — only for an existing instructor
              (new ones start ACTIVE via the DB default). */}
          {isEditing && canSetEmployment && (
            <div>
              <label className="block text-xs text-secondary mb-1">Employment</label>
              <select
                value={form.employmentStatus}
                onChange={e => {
                  const v = e.target.value as NonNullable<Instructor['employmentStatus']>;
                  setForm(p => ({ ...p, employmentStatus: v }));
                }}
                className={inputClass}
              >
                <option value="ACTIVE">Active — current instructor</option>
                <option value="INACTIVE">Inactive — left / retired</option>
              </select>
              {form.employmentStatus === 'INACTIVE' && (
                <p className="text-xs text-tertiary mt-1">
                  Hidden from the roster by default, can&apos;t be booked or assigned to students. Their login isn&apos;t
                  affected. Leaving the school? Set the last working day on the Staff page instead.
                </p>
              )}
            </div>
          )}

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
