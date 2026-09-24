// lib/staff-server.ts — SERVER ONLY (uses lib/staff-crypto.ts).
// Shared by app/api/staff/route.ts and app/api/staff/[id]/route.ts (B2 S2):
// turns a request body into staff_members columns (validated), and a DB row
// into the StaffMember shape the Staff page shows. ID documents go in
// encrypted and only ever come back masked here; the full values are served
// only by GET /api/staff/[id] (which logs the view).

import { encryptIdDocuments, decryptIdDocuments, isValidPan, isValidAadhaar, maskAadhaar, maskPan, maskPassport, type IdDocuments } from '@/lib/staff-crypto';
import type { StaffMember } from '@/lib/staff-id';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// client key -> [db column, kind]
const FIELDS: Record<string, [string, 'text' | 'date']> = {
  name: ['name', 'text'],
  joiningDate: ['joining_date', 'date'],
  lastWorkingDate: ['last_working_date', 'date'],
  designation: ['designation', 'text'],
  department: ['department', 'text'],
  mobile: ['mobile', 'text'],
  personalEmail: ['personal_email', 'text'],
  dateOfBirth: ['date_of_birth', 'date'],
  nationality: ['nationality', 'text'],
  address: ['address', 'text'],
  emergencyContactName: ['emergency_contact_name', 'text'],
  emergencyContactPhone: ['emergency_contact_phone', 'text'],
};

/**
 * Body -> columns. Only keys present in the body are returned (PATCH-friendly);
 * '' clears a field. On create, name and joining date are required and
 * isSub is read; on update isSub is ignored (the DB refuses a change anyway).
 */
export function parseStaffBody(body: Record<string, unknown>, isCreate: boolean): { data: Record<string, unknown>; error: string | null } {
  const data: Record<string, unknown> = {};
  for (const [key, [col, kind]] of Object.entries(FIELDS)) {
    if (body[key] === undefined) continue;
    if (body[key] !== null && typeof body[key] !== 'string') return { data, error: `${key} must be text.` };
    const v = ((body[key] as string | null) ?? '').trim();
    if (v && kind === 'date' && !DATE_RE.test(v)) return { data, error: `${key} must be a date.` };
    data[col] = v || null;
  }

  if (body.employmentType !== undefined) {
    const v = body.employmentType || null;
    if (v !== null && v !== 'PERMANENT' && v !== 'CONTRACT') return { data, error: 'Employment type must be Permanent or Contract.' };
    data.employment_type = v;
  }

  if ('name' in data && !data.name) return { data, error: 'Name is required.' };
  if ('joining_date' in data && !data.joining_date) return { data, error: 'Joining date is required.' };
  if (isCreate) {
    if (!data.name) return { data, error: 'Name is required.' };
    if (!data.joining_date) return { data, error: 'Joining date is required.' };
    data.is_sub = body.isSub === true;
  }

  if (body.idDocuments !== undefined) {
    const raw = (body.idDocuments ?? {}) as Record<string, unknown>;
    const str = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string).trim() : '');
    const docs: IdDocuments = {};
    const pan = str('pan').toUpperCase();
    const aadhaar = str('aadhaar').replace(/[\s-]/g, '');
    if (pan && !isValidPan(pan)) return { data, error: 'PAN must look like ABCDE1234F.' };
    if (aadhaar && !isValidAadhaar(aadhaar)) return { data, error: 'Aadhaar must be 12 digits.' };
    if (str('passportIssueDate') && !DATE_RE.test(str('passportIssueDate'))) return { data, error: 'Passport date of issue must be a date.' };
    if (pan) docs.pan = pan;
    if (aadhaar) docs.aadhaar = aadhaar;
    if (str('passportNumber')) docs.passportNumber = str('passportNumber').toUpperCase();
    if (str('passportIssueDate')) docs.passportIssueDate = str('passportIssueDate');
    if (str('passportIssuePlace')) docs.passportIssuePlace = str('passportIssuePlace');
    data.id_documents_enc = Object.keys(docs).length ? encryptIdDocuments(docs) : null;
  }

  return { data, error: null };
}

/** PostgREST may embed a one-to-one as an object or a one-item array. */
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Embedded select used by the list and create routes. */
export const STAFF_SELECT =
  '*, users!users_staff_member_id_fkey(role), instructors!instructors_staff_member_id_fkey(id), ames!ames_staff_member_id_fkey(id)';

export function toStaffMember(r: Record<string, unknown>): StaffMember {
  let documentsMasked: StaffMember['documentsMasked'] = null;
  if (r.id_documents_enc) {
    try {
      const d = decryptIdDocuments(r.id_documents_enc as string);
      documentsMasked = { pan: d.pan ? maskPan(d.pan) : null, aadhaar: d.aadhaar ? maskAadhaar(d.aadhaar) : null, passport: d.passportNumber ? maskPassport(d.passportNumber) : null };
    } catch {
      documentsMasked = { pan: 'unreadable', aadhaar: 'unreadable', passport: 'unreadable' }; // wrong/missing key
    }
  }
  return {
    id: r.id as number,
    staffId: r.staff_id as string,
    isSub: r.is_sub as boolean,
    name: r.name as string,
    joiningDate: r.joining_date as string,
    lastWorkingDate: (r.last_working_date as string) ?? null,
    designation: (r.designation as string) ?? null,
    department: (r.department as string) ?? null,
    employmentType: (r.employment_type as StaffMember['employmentType']) ?? null,
    mobile: (r.mobile as string) ?? null,
    personalEmail: (r.personal_email as string) ?? null,
    dateOfBirth: (r.date_of_birth as string) ?? null,
    nationality: (r.nationality as string) ?? null,
    address: (r.address as string) ?? null,
    emergencyContactName: (r.emergency_contact_name as string) ?? null,
    emergencyContactPhone: (r.emergency_contact_phone as string) ?? null,
    loginRole: one(r.users as { role: string } | null)?.role ?? null,
    instructorId: one(r.instructors as { id: number } | null)?.id ?? null,
    ameId: one(r.ames as { id: number } | null)?.id ?? null,
    documentsMasked,
  };
}

/**
 * Audit log for ID documents (add-staff-document-log-action.sql): who (user id
 * + role at the time) viewed, added or changed whose documents. Returns false
 * if the log row couldn't be written — callers must not show documents then.
 */
export async function logDocumentAction(
  staffMemberId: number | string,
  user: { email?: string | null; role?: string },
  action: 'VIEW' | 'ADD' | 'EDIT',
): Promise<boolean> {
  const { supabaseAdmin } = await import('@/lib/supabase-admin'); // lazy: keeps this file's pure helpers testable without DB keys
  const { data: actor } = await supabaseAdmin.from('users').select('id').eq('email', user.email ?? '').maybeSingle();
  if (!actor) return false;
  const { error } = await supabaseAdmin.from('staff_document_views')
    .insert({ staff_member_id: staffMemberId, viewed_by: actor.id, actor_role: user.role ?? null, action });
  if (error) console.error('Error logging ID document action:', error.code);
  return !error;
}

/** Friendly text for errors raised by add-staff-master.sql's triggers/checks. */
export function staffDbError(e: { code?: string; message?: string }, fallback: string): string {
  if (e.code === 'P0001' && e.message) return e.message; // our own RAISE EXCEPTION text
  if (e.message?.includes('staff_members_dates')) return "The last working day can't be before the joining date.";
  return fallback;
}
