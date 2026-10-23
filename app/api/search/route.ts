// GET /api/search?q= — record search for the Ctrl K panel (UI plan Step 2b, 23 Oct). Read only.
// Each record type is searched only for roles that can already open its page, using the same checks as that
// module's own API (module access with per-user overrides, STAFF_ROLES, BILLING_VIEW_ROLES). At most 5 per type.
// Results link to the record's page with ?q=, which fills that page's own search box.
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  BILLING_VIEW_ROLES, STAFF_ROLES, OVERRIDE_ELIGIBLE_ROLES, canViewModule, type PermissionOverrides,
} from '@/lib/permissions';
import { cleanRecordQuery } from '@/lib/search';

type Hit = { label: string; hint: string; href: string };
const LIMIT = 5;
const DOC_LABEL: Record<string, string> = { RECEIPT: 'Receipt', INVOICE: 'Invoice', CREDIT_NOTE: 'Credit note' };
const link = (path: string, q: string) => `${path}?q=${encodeURIComponent(q)}`;

export async function GET(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;
  const q = cleanRecordQuery(new URL(request.url).searchParams.get('q') ?? '');
  if (!q) return NextResponse.json({ results: [] });

  const role = session.user.role ?? '';
  let overrides: PermissionOverrides | null = null; // same lookup as requireModuleAccess
  if (OVERRIDE_ELIGIBLE_ROLES.includes(role) && session.user.email) {
    const { data } = await supabaseAdmin.from('users').select('permission_overrides').eq('email', session.user.email).maybeSingle();
    overrides = (data?.permission_overrides as PermissionOverrides) || null;
  }
  const can = (m: 'students' | 'aircraft' | 'instructors') => canViewModule(role, overrides, m);
  const billing = BILLING_VIEW_ROLES.includes(role);
  // cleanRecordQuery leaves no , ( ) " % _ so the value can sit inside a quoted PostgREST or() filter.
  const like = (...cols: string[]) => cols.map(c => `${c}.ilike."%${q}%"`).join(',');

  const searches: Promise<Hit[]>[] = [];
  const run = (what: string, p: PromiseLike<{ data: Record<string, unknown>[] | null; error: { code?: string } | null }>, map: (r: Record<string, unknown>) => Hit) =>
    searches.push(Promise.resolve(p).then(({ data, error: e }) => {
      if (e) { console.error(`Search: ${what} failed:`, e.code); return []; }
      return (data ?? []).map(map);
    }));

  if (can('students') || billing) {
    const page = can('students') ? '/dashboard/students' : '/dashboard/accounts';
    run('students', supabaseAdmin.from('students').select('name, enrollment_id').or(like('name', 'enrollment_id')).order('name').limit(LIMIT),
      r => ({ label: String(r.name), hint: `Student · ${r.enrollment_id ?? ''}`, href: link(page, String(r.enrollment_id || r.name)) }));
  }
  if (can('aircraft')) {
    run('aircraft', supabaseAdmin.from('aircraft').select('registration, type, model').or(like('registration', 'type', 'model')).order('registration').limit(LIMIT),
      r => ({ label: String(r.registration), hint: `Aircraft · ${r.type ?? ''} ${r.model ?? ''}`.trim(), href: link('/dashboard/aircraft', String(r.registration)) }));
  }
  if (can('instructors')) {
    run('instructors', supabaseAdmin.from('instructors').select('name, license_number').or(like('name', 'license_number')).order('name').limit(LIMIT),
      r => ({ label: String(r.name), hint: `Instructor · ${r.license_number ?? ''}`, href: link('/dashboard/instructors', String(r.name)) }));
  }
  if (STAFF_ROLES.includes(role)) {
    run('staff', supabaseAdmin.from('staff_members').select('name, staff_id').or(like('name', 'staff_id')).order('staff_id').limit(LIMIT),
      r => ({ label: String(r.name), hint: `Staff · ${r.staff_id}`, href: link('/dashboard/staff', String(r.staff_id)) }));
  }
  // Billing documents by number: billing roles see all; a student only their own (as GET /api/billing/students/[id]).
  const ownStudent = role === 'student' ? session.user.studentId : null;
  if (billing || ownStudent) {
    let docs = supabaseAdmin.from('billing_documents').select('doc_number, doc_type, student_id').ilike('doc_number', `%${q}%`);
    if (!billing) docs = docs.eq('student_id', ownStudent!);
    searches.push(Promise.resolve(docs.order('doc_number').limit(LIMIT)).then(async ({ data, error: e }) => {
      if (e) { console.error('Search: documents failed:', e.code); return []; }
      if (!data?.length) return [];
      const { data: owners } = await supabaseAdmin.from('students').select('id, name, enrollment_id').in('id', data.map(d => d.student_id));
      return data.map(d => {
        const s = owners?.find(o => String(o.id) === String(d.student_id));
        return {
          label: `${DOC_LABEL[d.doc_type] ?? 'Document'} ${d.doc_number}`, hint: s?.name ?? '',
          href: billing ? link('/dashboard/accounts', String(s?.enrollment_id || s?.name || '')) : '/dashboard/my-account',
        };
      });
    }));
  }

  return NextResponse.json({ results: (await Promise.all(searches)).flat() });
}
