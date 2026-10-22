// app/api/billing/students/[id]/route.ts — billing B1 (21 Oct; claude/billing-design-2026-10-20.md).
// GET: the student's ledger, balance, credit limit and rates (billing staff; a student sees only their own).
// POST { action, ... }:
//   payment    { amount, method, reference?, date?, note? }        billing staff
//   opening    { amount, owes: boolean, note? }                    billing staff; one live opening balance per student
//   adjustment { amount, charge: boolean, note }                   billing staff; note required
//   void       { entryId, reason }                                 admin / super admin; entries are never deleted
//   credit     { creditLimit, note? }                              admin / super admin
//   rate       { category, hourlyRate | null }                     admin / super admin; null = back to the school rate
// B2 (21 Oct): course packages — admin / super admin / accounts:
//   assignPackage { packageId, agreedFee?, plan: [{ due_date, amount }], note? }  charges fee + GST; the plan must add up
//   editPlan      { plan: [...] }                                   replaces the active package's plan (same total)
//   closePackage  {}                                                stops it supplying hours; nothing automatic happens to money
// B4 (22 Oct): a payment gets a numbered receipt, plus a GST invoice for all charges not yet invoiced once the school's
// GST details are set; voiding an invoiced charge issues a credit note. state { state: '27' | null } = GST place of supply.
//   refund { entryId, amount, reason }   admin / super admin: credit note for all or part (incl. GST) of an invoiced charge
//   payout { amount, date?, reference, bankName, note? }  billing staff (B5): the refund paid out by bank — at most the credit on account

import { NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/api-auth';
import { BILLING_VIEW_ROLES, BILLING_RECORD_ROLES, BILLING_ADMIN_ROLES, BILLING_PACKAGE_ROLES } from '@/lib/permissions';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ratesFor, activePackage, documentParties, gstRateOn, balances } from '@/lib/billing-server';
import { BILLING_CATEGORIES, PAYMENT_METHODS, GST_STATES, balanceOf, parseAmount, round2, dueNow, formatINR } from '@/lib/billing';
import { todayIST } from '@/lib/ist';

type RouteContext = { params: Promise<{ id: string }> };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function GET(_request: Request, context: RouteContext) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { id } = await context.params;
  const role = session.user.role ?? '';
  const own = role === 'student' && session.user.studentId === id;
  if (!own && !BILLING_VIEW_ROLES.includes(role)) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });

  const [{ data: student }, { data: entries, error: dbError }, rates, pkg, { data: docs }, gstRate] = await Promise.all([
    supabaseAdmin.from('students').select('id, name, enrollment_id, credit_limit, credit_note, billing_state').eq('id', id).maybeSingle(),
    supabaseAdmin.from('ledger_entries').select('*').eq('student_id', id).order('entry_date', { ascending: false }).order('id', { ascending: false }),
    ratesFor(id),
    activePackage(id),
    supabaseAdmin.from('billing_documents').select('*, lines:billing_document_lines(*)').eq('student_id', id)
      .order('doc_date', { ascending: false }).order('id', { ascending: false }),
    gstRateOn(todayIST()),
  ]);
  if (dbError) {
    console.error('Error loading ledger:', dbError.code);
    return NextResponse.json({ error: 'Failed to load the account.' }, { status: 500 });
  }
  if (!student) return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  const balance = balanceOf(entries ?? []);
  // B4: a receipt whose payment was voided is cancelled; a student doesn't see cancelled receipts.
  const voidedIds = new Set((entries ?? []).filter(e => e.voided_at).map(e => e.id));
  const documents = (docs ?? []).map(d => ({ ...d, created_by: null, cancelled: d.doc_type === 'RECEIPT' && voidedIds.has(d.payment_entry_id) }))
    .filter(d => !(own && d.cancelled));
  return NextResponse.json({
    student: { id: student.id, name: student.name, enrollmentId: student.enrollment_id },
    balance,
    package: pkg && own ? { ...pkg, note: null } : pkg, // the package note is staff-only, like the credit note
    due: dueNow(balance, pkg?.instalments ?? [], todayIST()),
    creditLimit: Number(student.credit_limit ?? 0),
    creditNote: own ? null : student.credit_note ?? null, // staff-only note (operator, 21 Oct)
    billingState: student.billing_state ?? null,
    gstRate, // today's school-wide GST %, 0 until the school has a valid GSTIN (packages are charged at this)
    documents,
    rates,
    // A student sees only live entries, without who made them (operator, 21 Oct: void reasons are internal).
    entries: own ? (entries ?? []).filter(e => !e.voided_at).map(e => ({ ...e, created_by: null })) : entries ?? [],
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const action = body.action;
  const adminOnly = action === 'void' || action === 'credit' || action === 'rate' || action === 'refund';
  const packageAction = action === 'assignPackage' || action === 'editPlan' || action === 'closePackage';
  const { session, error } = await requireRole(adminOnly ? BILLING_ADMIN_ROLES : packageAction ? BILLING_PACKAGE_ROLES : BILLING_RECORD_ROLES);
  if (error) return error;
  const by = session.user.email ?? 'unknown';

  const { data: student } = await supabaseAdmin.from('students').select('id').eq('id', id).maybeSingle();
  if (!student) return NextResponse.json({ error: 'Student not found.' }, { status: 404 });

  // The response for a save: success, or the database refusal in words.
  const done = (dbError: { code?: string } | null, what: string): NextResponse => {
    if (!dbError) return NextResponse.json({ success: true });
    if (dbError.code === '23505') return NextResponse.json({ error: 'This student already has an opening balance. Void it first to enter a new one.' }, { status: 409 });
    console.error(`Billing: ${what} failed:`, dbError.code);
    return NextResponse.json({ error: `Failed to save the ${what}.` }, { status: 500 });
  };

  if (action === 'payment' || action === 'opening' || action === 'adjustment') {
    const amount = parseAmount(body.amount);
    if (amount === null) return NextResponse.json({ error: 'Enter an amount above 0 with at most 2 decimals.' }, { status: 400 });
    const note = text(body.note);
    const date = typeof body.date === 'string' && DATE_RE.test(body.date) ? body.date : todayIST();
    let row: Record<string, unknown>;
    if (action === 'payment') {
      const method = String(body.method ?? '');
      if (!(PAYMENT_METHODS as readonly string[]).includes(method)) return NextResponse.json({ error: 'Pick a payment method.' }, { status: 400 });
      // B4: the payment, its receipt and any invoice are saved together in one database transaction.
      const p = await documentParties(id);
      const { data: issued, error: dbError } = await supabaseAdmin.rpc('billing_record_payment', {
        p_student: id, p_date: date, p_amount: amount, p_method: method, p_reference: text(body.reference, 100) || null,
        p_description: note || 'Payment received', p_by: by, p_today: todayIST(), p_receipt_seller: p.receiptSeller,
        p_seller: p.seller, p_buyer: p.buyer, p_igst: p.igst, p_sac: p.sac, p_prefixes: { receipt: p.prefixes.receipt, invoice: p.prefixes.invoice },
      });
      if (dbError) return done(dbError, 'payment');
      return NextResponse.json({ success: true, receipt: issued?.receipt ?? null, invoice: issued?.invoice ?? null });
    } else if (action === 'opening') {
      const owes = body.owes === true;
      row = { kind: 'OPENING', [owes ? 'debit' : 'credit']: amount, description: note || (owes ? 'Opening balance (owed)' : 'Opening balance (in credit)') };
    } else {
      if (!note) return NextResponse.json({ error: 'An adjustment needs a reason.' }, { status: 400 });
      row = { kind: 'ADJUSTMENT', [body.charge === true ? 'debit' : 'credit']: amount, description: note };
    }
    const { error: dbError } = await supabaseAdmin.from('ledger_entries')
      .insert({ student_id: id, entry_date: date, source: 'MANUAL', created_by: by, ...row });
    return done(dbError, action);
  }

  if (action === 'void') {
    const reason = text(body.reason);
    if (!reason) return NextResponse.json({ error: 'Give a reason for voiding.' }, { status: 400 });
    if (!Number.isSafeInteger(Number(body.entryId))) return NextResponse.json({ error: 'Pick an entry to void.' }, { status: 400 });
    // B2: a package fee whose hours have been flown can't simply be voided — those flights were never charged hourly.
    const { data: target } = await supabaseAdmin.from('ledger_entries').select('kind, source, source_id, credit_note_id').eq('id', Number(body.entryId)).eq('student_id', id).maybeSingle();
    // B4 refunds: voiding a refund, or a charge already partly refunded, would leave the credit notes and ledger out of step.
    if (target?.kind === 'ADJUSTMENT' && target.credit_note_id) {
      return NextResponse.json({ error: 'This refund has a credit note, so it can\'t be voided. Record a new charge if it was a mistake.' }, { status: 409 });
    }
    if (target?.kind === 'CHARGE') {
      const { count } = await supabaseAdmin.from('billing_document_lines').select('id, billing_documents!inner(doc_type)', { count: 'exact', head: true })
        .eq('ledger_entry_id', Number(body.entryId)).eq('billing_documents.doc_type', 'CREDIT_NOTE');
      if (count) return NextResponse.json({ error: 'Part of this charge has already been refunded with a credit note. Refund the rest instead of voiding it.' }, { status: 409 });
    }
    if (target?.source === 'PACKAGE') {
      const { count } = await supabaseAdmin.from('package_usage').select('id', { count: 'exact', head: true }).eq('student_package_id', Number(target.source_id));
      if (count) {
        return NextResponse.json({
          error: `${count} flight${count === 1 ? ' has' : 's have'} already used this package's hours, so its fee can't be voided. Close the package, then refund the unused part with an adjustment.`,
        }, { status: 409 });
      }
    }
    // B4: one transaction voids the entry and, if it was invoiced, issues a credit note against that invoice.
    const { data: voided, error: dbError } = await supabaseAdmin.rpc('billing_void_entry', {
      p_entry: Number(body.entryId), p_student: id, p_reason: reason, p_by: by, p_today: todayIST(),
      p_prefix: (await documentParties(id)).prefixes.creditNote,
    });
    if (dbError) return done(dbError, 'void');
    if (!voided) return NextResponse.json({ error: 'No live entry with that id for this student.' }, { status: 404 });
    // B2: voiding a package's fee closes that package too.
    if (voided.source === 'PACKAGE') {
      const { error: closeError } = await supabaseAdmin.from('student_packages')
        .update({ status: 'CLOSED', closed_by: by, closed_at: new Date().toISOString() }).eq('id', Number(voided.source_id)).eq('status', 'ACTIVE');
      if (closeError) console.error('Billing: closing the voided package failed:', closeError.code);
    }
    return NextResponse.json({ success: true, creditNote: voided.credit_note ?? null });
  }

  if (action === 'refund') {
    const reason = text(body.reason);
    const amount = parseAmount(body.amount);
    if (!reason) return NextResponse.json({ error: 'Give a reason for the refund.' }, { status: 400 });
    if (amount === null || !Number.isSafeInteger(Number(body.entryId))) return NextResponse.json({ error: 'Enter an amount above 0 with at most 2 decimals.' }, { status: 400 });
    const { data: refunded, error: dbError } = await supabaseAdmin.rpc('billing_refund_entry', {
      p_entry: Number(body.entryId), p_student: id, p_amount: amount, p_reason: reason, p_by: by, p_today: todayIST(),
      p_prefix: (await documentParties(id)).prefixes.creditNote,
    });
    if (dbError?.message?.startsWith('BILLING: ')) return NextResponse.json({ error: dbError.message.slice(9) }, { status: 400 });
    if (dbError) return done(dbError, 'refund');
    return NextResponse.json({ success: true, creditNote: refunded?.credit_note ?? null });
  }

  if (action === 'payout') {
    // B5 (operator, 22 Oct): accounts record a refund once it is paid out — date, UTR and bank — up to the credit on account.
    const amount = parseAmount(body.amount);
    const reference = text(body.reference, 100), bankName = text(body.bankName, 100);
    if (amount === null) return NextResponse.json({ error: 'Enter an amount above 0 with at most 2 decimals.' }, { status: 400 });
    if (!reference || !bankName) return NextResponse.json({ error: 'Enter the UTR and the bank name.' }, { status: 400 });
    // shortcut: check-then-insert, so two payouts saved in the same instant could both pass; fine for one accounts desk.
    const onAccount = (await balances([id])).get(id) ?? 0;
    if (amount > onAccount) {
      return NextResponse.json({ error: onAccount > 0 ? `Only ${formatINR(onAccount)} is on account; a payout can't be more.` : 'There is no credit on account to pay out.' }, { status: 400 });
    }
    const date = typeof body.date === 'string' && DATE_RE.test(body.date) ? body.date : todayIST();
    const { error: dbError } = await supabaseAdmin.from('ledger_entries').insert({
      student_id: id, entry_date: date, kind: 'ADJUSTMENT', source: 'MANUAL', debit: amount, method: 'BANK', reference, bank_name: bankName,
      description: text(body.note) || 'Refund paid to the student', created_by: by,
    });
    return done(dbError, 'payout');
  }

  if (action === 'state') {
    const state = body.state === null || body.state === '' ? null : String(body.state);
    if (state !== null && !(state in GST_STATES)) return NextResponse.json({ error: 'Pick a state from the list.' }, { status: 400 });
    const { error: dbError } = await supabaseAdmin.from('students').update({ billing_state: state }).eq('id', id);
    return done(dbError, 'state');
  }

  if (action === 'credit') {
    const raw = body.creditLimit;
    const creditLimit = raw === 0 || raw === '0' ? 0 : parseAmount(raw);
    if (creditLimit === null) return NextResponse.json({ error: 'Enter a credit limit of 0 or more, with at most 2 decimals.' }, { status: 400 });
    const { error: dbError } = await supabaseAdmin.from('students')
      .update({ credit_limit: round2(creditLimit), credit_note: text(body.note) || null }).eq('id', id);
    return done(dbError, 'credit limit');
  }

  if (action === 'rate') {
    const category = String(body.category ?? '');
    if (!(BILLING_CATEGORIES as readonly string[]).includes(category)) return NextResponse.json({ error: 'Unknown rate category.' }, { status: 400 });
    if (body.hourlyRate === null) {
      const { error: dbError } = await supabaseAdmin.from('student_rates').delete().eq('student_id', id).eq('category', category);
      return done(dbError, 'rate');
    }
    const hourlyRate = parseAmount(body.hourlyRate);
    if (hourlyRate === null) return NextResponse.json({ error: 'Enter an hourly rate above 0 with at most 2 decimals.' }, { status: 400 });
    const { error: dbError } = await supabaseAdmin.from('student_rates')
      .upsert({ student_id: id, category, hourly_rate: hourlyRate, updated_by: by, updated_at: new Date().toISOString() });
    return done(dbError, 'rate');
  }

  if (packageAction) {
    // The database functions refuse with "BILLING: <reason>"; that reason is safe to show.
    const refused = (e: { message?: string; code?: string }, what: string) => e.message?.startsWith('BILLING: ')
      ? NextResponse.json({ error: e.message.slice(9) }, { status: 400 })
      : done(e, what);
    const plan = parsePlan(body.plan);
    if (action === 'closePackage') {
      const { data: rows, error: dbError } = await supabaseAdmin.from('student_packages')
        .update({ status: 'CLOSED', closed_by: by, closed_at: new Date().toISOString() })
        .eq('student_id', id).eq('status', 'ACTIVE').select('id');
      if (dbError) return done(dbError, 'package');
      if (!rows?.length) return NextResponse.json({ error: 'This student has no active package.' }, { status: 404 });
      return NextResponse.json({ success: true });
    }
    if (typeof plan === 'string') return NextResponse.json({ error: plan }, { status: 400 });
    if (action === 'editPlan') {
      const { data: sp } = await supabaseAdmin.from('student_packages').select('id').eq('student_id', id).eq('status', 'ACTIVE').maybeSingle();
      if (!sp) return NextResponse.json({ error: 'This student has no active package.' }, { status: 404 });
      const { error: dbError } = await supabaseAdmin.rpc('replace_package_instalments', { p_student_package: sp.id, p_plan: plan });
      return dbError ? refused(dbError, 'payment plan') : NextResponse.json({ success: true });
    }
    const { data: listed } = await supabaseAdmin.from('course_packages').select('fee').eq('id', Number(body.packageId)).maybeSingle();
    if (!listed) return NextResponse.json({ error: 'Pick a package.' }, { status: 400 });
    const agreedFee = body.agreedFee === undefined || body.agreedFee === '' ? Number(listed.fee)
      : body.agreedFee === 0 || body.agreedFee === '0' ? 0 : parseAmount(body.agreedFee);
    if (agreedFee === null) return NextResponse.json({ error: 'Enter the agreed fee (0 or more, at most 2 decimals).' }, { status: 400 });
    const { error: dbError } = await supabaseAdmin.rpc('assign_student_package', {
      p_student: id, p_package: Number(body.packageId), p_agreed_fee: agreedFee, p_plan: plan,
      p_note: text(body.note), p_by: by, p_date: todayIST(),
    });
    if (dbError?.code === '23505') return NextResponse.json({ error: 'This student already has an active package. Close it first.' }, { status: 409 });
    return dbError ? refused(dbError, 'package') : NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}

/** A payment plan from the request: [{ due_date: 'YYYY-MM-DD', amount }], or the reason it isn't one. */
function parsePlan(raw: unknown): { due_date: string; amount: number }[] | string {
  if (!Array.isArray(raw) || raw.length > 60) return 'The payment plan can have at most 60 instalments.'; // [] only for a free package (the database checks)
  const rows: { due_date: string; amount: number }[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const date = typeof r?.due_date === 'string' && DATE_RE.test(r.due_date) && !Number.isNaN(Date.parse(r.due_date)) ? r.due_date : null;
    const amount = parseAmount(r?.amount);
    if (!date || amount === null) return 'Each instalment needs a valid date and an amount above 0 with at most 2 decimals.';
    rows.push({ due_date: date, amount });
  }
  return rows;
}
