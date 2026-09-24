// lib/staff-id.ts
// Staff IDs (B2, operator decisions 2026-09-24; claude/staff-master-design-2026-09-24.md):
// PREFIX + 'E' + joining YYMM + running number, always 15 characters —
// 'HFA', joined Sep 2026, n=1 -> 'HFAE26090000001'. Contract AMEs use the
// fixed prefix 'SUB' with their own running number. IDs are issued only by
// the staff_members_issue_id() trigger (add-staff-master.sql), which must
// format them the same way; this copy is for previews and tests.
// Pure — safe on client and server.

export const STAFF_ID_LENGTH = 15;
export const SUB_PREFIX = 'SUB';

/** 1–5 upper-case letters/digits, and not 'SUB' (reserved for contract AMEs). */
export function isValidStaffPrefix(prefix: string): boolean {
  return /^[A-Z0-9]{1,5}$/.test(prefix) && prefix !== SUB_PREFIX;
}

/** joiningDate is 'YYYY-MM-DD'. Throws if n no longer fits in 15 characters. */
export function formatStaffId(prefix: string, joiningDate: string, n: number): string {
  const width = STAFF_ID_LENGTH - prefix.length - 5;
  const num = String(n);
  if (num.length > width) throw new Error(`Staff ID numbers for ${prefix} are used up.`);
  return prefix + 'E' + joiningDate.slice(2, 4) + joiningDate.slice(5, 7) + num.padStart(width, '0');
}

/** Leaving takes effect at 17:00 IST on the last working day (operator, 24 Sep). */
export function hasLeft(lastWorkingDate: string | null | undefined, now: Date = new Date()): boolean {
  return !!lastWorkingDate && now.getTime() >= new Date(`${lastWorkingDate}T17:00:00+05:30`).getTime();
}

/** One row of GET /api/staff. ID documents only ever arrive masked here. */
export type StaffMember = {
  id: number;
  staffId: string;
  isSub: boolean;
  name: string;
  joiningDate: string;
  lastWorkingDate: string | null;
  designation: string | null;
  department: string | null;
  employmentType: 'PERMANENT' | 'CONTRACT' | null;
  mobile: string | null;
  personalEmail: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  loginRole: string | null;
  instructorId: number | null;
  ameId: number | null;
  /** Last 4 only, e.g. { pan: 'XXXXXX234F', aadhaar: 'XXXX-XXXX-1234', passport: 'XXXX4567' }; null = none on file. */
  documentsMasked: { pan: string | null; aadhaar: string | null; passport: string | null } | null;
};
