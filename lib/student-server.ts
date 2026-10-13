// lib/student-server.ts — SERVER ONLY. B3/B4 student master helpers
// (claude/student-master-design-2026-10-13.md): ID documents (Aadhaar + passport,
// encrypted with the same key and format as staff), their audit log, and the
// "only an Active student can be booked" rule.

import { encryptIdDocuments, decryptIdDocuments, isValidAadhaar, maskAadhaar, maskPassport, type IdDocuments } from '@/lib/staff-crypto';

export const STUDENT_STATUSES = ['ACTIVE', 'SUSPENDED', 'GRADUATED', 'LEFT'] as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
// Only admin / super admin see or change ID numbers and status (operator, 13 Oct).
export const STUDENT_ADMIN_ROLES = ['admin', 'super_admin'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** body.idDocuments → encrypted value (null = clear all). Students hold Aadhaar + passport only. */
export function parseStudentDocs(raw: unknown): { enc: string | null; error: string | null } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof r[k] === 'string' ? (r[k] as string).trim() : '');
  const aadhaar = str('aadhaar').replace(/[\s-]/g, '');
  if (aadhaar && !isValidAadhaar(aadhaar)) return { enc: null, error: 'Aadhaar must be 12 digits.' };
  if (str('passportIssueDate') && !DATE_RE.test(str('passportIssueDate'))) return { enc: null, error: 'Passport date of issue must be a date.' };
  const docs: IdDocuments = {};
  if (aadhaar) docs.aadhaar = aadhaar;
  if (str('passportNumber')) docs.passportNumber = str('passportNumber').toUpperCase();
  if (str('passportIssueDate')) docs.passportIssueDate = str('passportIssueDate');
  if (str('passportIssuePlace')) docs.passportIssuePlace = str('passportIssuePlace');
  return { enc: Object.keys(docs).length ? encryptIdDocuments(docs) : null, error: null };
}

/** Last-4 masks for the list view; 'unreadable' when the key is wrong or missing. */
export function maskStudentDocs(enc: unknown): { aadhaar: string | null; passport: string | null } | null {
  if (!enc) return null;
  try {
    const d = decryptIdDocuments(enc as string);
    return { aadhaar: d.aadhaar ? maskAadhaar(d.aadhaar) : null, passport: d.passportNumber ? maskPassport(d.passportNumber) : null };
  } catch {
    return { aadhaar: 'unreadable', passport: 'unreadable' };
  }
}

/** Strips the encrypted blob from a students row before it leaves the server; admins get the masks. */
export function publicStudentRow(row: Record<string, unknown>, isAdmin: boolean): Record<string, unknown> {
  const { id_documents_enc, ...rest } = row;
  return isAdmin ? { ...rest, documents_masked: maskStudentDocs(id_documents_enc) } : rest;
}

export async function logStudentDocumentAction(
  studentId: string,
  user: { email?: string | null; role?: string },
  action: 'VIEW' | 'ADD' | 'EDIT',
): Promise<boolean> {
  const { supabaseAdmin } = await import('@/lib/supabase-admin'); // lazy: keeps the pure helpers testable without DB keys
  const { data: actor } = await supabaseAdmin.from('users').select('id').eq('email', user.email ?? '').maybeSingle();
  if (!actor) return false;
  const { error } = await supabaseAdmin.from('student_document_views')
    .insert({ student_id: studentId, viewed_by: actor.id, actor_role: user.role ?? null, action });
  if (error) console.error('Error logging student ID document action:', error.code);
  return !error;
}

/** B4: only an Active student can be booked. Returns the refusal message, or null. */
export async function studentBookingRefusal(studentId: string): Promise<string | null> {
  const { supabaseAdmin } = await import('@/lib/supabase-admin');
  const { data } = await supabaseAdmin.from('students').select('status, status_reason').eq('id', studentId).maybeSingle();
  if (!data || !data.status || data.status === 'ACTIVE') return null;
  if (data.status === 'SUSPENDED') return `This student is suspended${data.status_reason ? ` (${data.status_reason})` : ''} and can't be booked.`;
  return `This student is marked ${data.status === 'GRADUATED' ? 'Graduated' : 'Left'} and can't be booked.`;
}
