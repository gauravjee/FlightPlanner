// app/api/cron/check-notifications/route.ts
// Digest emails, called by cron-job.org at 06:00 and 18:00 IST
// (?secret=CRON_SECRET or Authorization: Bearer). Rewritten 28 Sep 2026 to
// replace the old one-email-per-alert-per-admin sends (operator item 14):
//
// 1. MAINTENANCE DIGEST (every run, also when there is nothing to report:
//    "Nothing due", operator 7 Oct): ONE shared email with every active admin,
//    super admin and maintenance user together in To (operator, 3 Oct: the
//    group sees who else got it and can reply-all). Sections and
//    flags are in lib/notification-digest.ts. The AME column shows
//    maintenance_records.ame_name ("Unassigned" when blank).
// 2. PEOPLE DIGEST (once a day, on the first run that day — 06:00, or 18:00 if
//    06:00 didn't run): student medical / SPL and instructor CPL and staff
//    medicals expired or expiring within 30 days: ONE shared email with every
//    active admin, super admin and operations user in To; each person listed
//    also gets their own separate email on reminder days (30, 15, then daily
//    from 7 days before expiry until renewed). A missed run is caught up on
//    the next run (operator 7 Oct): what was sent, and when, is kept in
//    digest_sends (add-digest-sends.sql) — see reminderDue().
//
// 3. BILLING (B5c, operator 22 Oct): students on a course-package payment plan
//    get their own email 7 and 1 days before an instalment falls due (when
//    money will be owed that day) and, while overdue, on the first day and then
//    weekly; admin, super admin and accounts get one list a day of overdue
//    students and instalments due in the next 7 days (only when there is one).
//    Uses digest_sends keys 'billing-digest', 'billing-due|…', 'billing-overdue|…'.
//
// `?digest=maintenance|people|billing` runs just one (for testing). Each email sent
// is logged to notification_log.
// Addresses ending in .test (the test logins) are skipped: that domain is
// reserved and can never receive mail. For a live test, `?testTo=you@x.com`
// sends every email to that one address instead, with the real recipients in
// the subject — nobody else gets anything. Test runs ignore and don't update
// digest_sends, so they never hold back a real reminder.
// Resend batch send: one API call per digest (≤100 emails per call).

import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { todayIST } from '@/lib/ist';
import { hasLeft } from '@/lib/staff-id';
import {
  addDays, classifyMaintenance, reminderDue, expiryItem, splitExpiry, maintenanceHtml, expiryHtml, wrapEmail, esc, table,
  type MxRow, type ExpiryItem,
} from '@/lib/notification-digest';
import { balances } from '@/lib/billing-server';
import { dueNow, formatINR, instalmentReminder, type Instalment } from '@/lib/billing';

const FROM = 'FlightPro Manager <noreply@pushpak.mahesho.com>';
const MX_COLUMNS = 'id, aircraft_id, maintenance_type, description, scheduled_date, completed_date, status, is_squawk, ticket_number, ame_name, assigned_ame_id';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Mail = { to: string[]; subject: string; html: string }; // ponytail: Resend allows 50 addresses per email; split the group if staff grows past that

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const url = new URL(request.url);
  if (cronSecret) {
    const headerSecret = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (headerSecret !== cronSecret && url.searchParams.get('secret') !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    console.warn('⚠️ CRON_SECRET is not set — /api/cron/check-notifications is unauthenticated. Set CRON_SECRET.');
  }
  if (!process.env.RESEND_API_KEY) {
    console.error('check-notifications: RESEND_API_KEY is not set.');
    return NextResponse.json({ error: 'Email is not configured.' }, { status: 500 });
  }

  const digest = url.searchParams.get('digest') ?? 'both';
  const testTo = url.searchParams.get('testTo');
  if (testTo !== null && !EMAIL_RE.test(testTo)) return NextResponse.json({ error: 'testTo is not a valid email address.' }, { status: 400 });
  const today = todayIST();
  const dashboardUrl = `${url.protocol}//${url.host}/dashboard`;
  // "23 Oct 2026" — the date format in every email (operator, 23 Oct).
  const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const stamp = dayLabel(today);
  const mails: Mail[] = [];
  const sentKeys: string[] = []; // digest_sends rows to write once the emails have gone
  const result: Record<string, unknown> = { today, digest };

  // B4 Grounded (operator, 14 Oct): a grounding covers its end date; the first run after it returns the student to Active.
  const { data: ended, error: groundError } = await supabaseAdmin.from('students')
    .update({ status: 'ACTIVE', status_reason: 'Grounding ended', status_changed_at: new Date().toISOString(), status_changed_by: null, grounded_until: null })
    .eq('status', 'GROUNDED').lt('grounded_until', today).select('id');
  if (groundError) console.error('check-notifications: ending groundings failed:', groundError.code);
  result.groundingsEnded = ended?.length ?? 0;

  try {
    const recipients = async (roles: string[]) => {
      const { data, error } = await supabaseAdmin.from('users').select('email').in('role', roles).eq('is_active', true);
      if (error) throw error;
      return [...new Set((data ?? []).map(u => (u.email as string).trim()).filter(Boolean))];
    };

    if (digest === 'maintenance' || digest === 'both') {
      const [open, closed, aircraft, ames] = await Promise.all([
        supabaseAdmin.from('maintenance_records').select(MX_COLUMNS).in('status', ['SCHEDULED', 'IN_PROGRESS']),
        supabaseAdmin.from('maintenance_records').select(MX_COLUMNS).eq('status', 'COMPLETED').eq('is_baseline', false).gte('completed_date', addDays(today, -15)),
        supabaseAdmin.from('aircraft').select('id, registration'),
        supabaseAdmin.from('ames').select('id, name'),
      ]);
      const failed = [open, closed, aircraft, ames].find(r => r.error);
      if (failed) throw failed.error;
      const reg = new Map((aircraft.data ?? []).map(a => [Number(a.id), a.registration as string]));
      // AME column: open tasks show who is assigned (else the certifying AME
      // if one is already on file); closed tasks show who certified it.
      const ameName = new Map((ames.data ?? []).map(a => [Number(a.id), a.name as string]));
      type Row = MxRow & { assigned_ame_id: number | null };
      const withAme = (rows: Row[], closedRows: boolean): MxRow[] => rows.map(r => {
        const assigned = r.assigned_ame_id != null ? ameName.get(Number(r.assigned_ame_id)) ?? null : null;
        return { ...r, ame_name: closedRows ? r.ame_name ?? assigned : assigned ?? r.ame_name };
      });
      const sections = classifyMaintenance(withAme(open.data as Row[], false), withAme(closed.data as Row[], true), today);
      const count = (i: number) => sections[i].rows.length;
      result.maintenance = Object.fromEntries(sections.map(s => [s.title, s.rows.length]));
      const nothing = !sections.some(s => s.rows.length);
      const subject = nothing
        ? `FlightPro Maintenance: Nothing due (${stamp})`
        : `FlightPro Maintenance: ${count(0)} overdue · ${count(1)} due in 7 days · ${count(2)} open defects/records (${stamp})`;
      const intro = nothing ? `As of ${stamp}: Nothing due — nothing overdue, due, open or upcoming, and nothing closed in the last 15 days.` : `As of ${stamp}.`;
      const html = wrapEmail('Maintenance status', intro, maintenanceHtml(sections, id => reg.get(id) ?? 'Unknown aircraft', today), dashboardUrl);
      const to = await recipients(['admin', 'super_admin', 'maintenance']);
      if (to.length) mails.push({ to, subject, html });
    }

    if (digest === 'people' || digest === 'both') {
      const [students, instructors, staff] = await Promise.all([
        supabaseAdmin.from('students').select('name, initials, email, medical_expiry, spl_expiry_date').in('status', ['ACTIVE', 'GROUNDED', 'SUSPENDED']), // B4: a grounded or suspended student still needs reminders
        supabaseAdmin.from('instructors').select('name, initials, email, license_expiry_date').eq('employment_status', 'ACTIVE'),
        // 2026-10-03: staff medicals (staff_members.medical_expiry). Their
        // own email = their login's, else the personal email on the record.
        supabaseAdmin.from('staff_members').select('name, personal_email, medical_expiry, last_working_date, users!users_staff_member_id_fkey(email)')
          .not('medical_expiry', 'is', null),
      ]);
      const sends = await supabaseAdmin.from('digest_sends').select('key, sent_on').gte('sent_on', addDays(today, -31));
      const failed = [students, instructors, staff, sends].find(r => r.error);
      if (failed) throw failed.error;
      // Latest send per key. Test runs (testTo) start from nothing, so they show what a fresh run sends.
      const lastSent = new Map<string, string>();
      if (!testTo) for (const r of sends.data ?? []) if ((lastSent.get(r.key) ?? '') < r.sent_on) lastSent.set(r.key, r.sent_on);
      const items: ExpiryItem[] = [];
      for (const s of students.data ?? []) {
        const base = { person: `${s.name} (${s.initials})`, kind: 'Student' as const, email: (s.email as string)?.trim() || null };
        items.push(...[expiryItem({ ...base, document: 'Medical' }, s.medical_expiry, today),
          expiryItem({ ...base, document: 'SPL' }, s.spl_expiry_date, today)].filter((i): i is ExpiryItem => !!i));
      }
      for (const i of instructors.data ?? []) {
        const item = expiryItem({ person: `${i.name} (${i.initials})`, kind: 'Instructor', document: 'CPL', email: (i.email as string)?.trim() || null }, i.license_expiry_date, today);
        if (item) items.push(item);
      }
      for (const m of staff.data ?? []) {
        if (hasLeft(m.last_working_date as string | null)) continue;
        const login = Array.isArray(m.users) ? m.users[0] : m.users;
        const email = ((login as { email?: string } | null)?.email || (m.personal_email as string) || '').trim() || null;
        const item = expiryItem({ person: m.name as string, kind: 'Staff', document: 'Medical', email }, m.medical_expiry as string, today);
        if (item) items.push(item);
      }
      const sections = splitExpiry(items);
      result.people = { expired: sections[0].rows.length, expiring: sections[1].rows.length };
      if (items.length && lastSent.get('people-digest') !== today) { // the group email: once a day
        const subject = `FlightPro Licences & Medicals: ${sections[0].rows.length} expired · ${sections[1].rows.length} expiring in 30 days (${stamp})`;
        const html = wrapEmail('Student and staff licences and medicals', `As of ${stamp}.`, expiryHtml(sections, true), dashboardUrl);
        const to = await recipients(['admin', 'super_admin', 'operations']);
        if (to.length) { mails.push({ to, subject, html }); sentKeys.push('people-digest'); }
      }
      if (items.length) {
        // One email per person, listing all of their own items.
        const byPerson = new Map<string, ExpiryItem[]>();
        // A malformed address would make Resend reject the whole batch, so skip it.
        for (const i of items) if (i.email && EMAIL_RE.test(i.email)) byPerson.set(i.email, [...(byPerson.get(i.email) ?? []), i]);
        for (const [email, own] of byPerson) {
          // Only when a reminder is due (or was missed); the email still lists all their items.
          const key = (i: ExpiryItem) => `remind|${email}|${i.document}|${i.expiry}`;
          if (!own.some(i => reminderDue(i.expiry, today, lastSent.get(key(i))))) continue;
          sentKeys.push(...own.map(key));
          const expired = own.some(i => i.days < 0);
          mails.push({
            to: [email],
            subject: expired ? 'Action needed: your licence or medical has expired' : 'Reminder: your licence or medical expires soon',
            html: wrapEmail(`Hello ${own[0].person.replace(/ \([^)]*\)$/, '')}`, 'Please arrange renewal and send the updated certificate to the office.', expiryHtml(splitExpiry(own), false), dashboardUrl),
          });
        }
      }
    }

    if (digest === 'billing' || digest === 'both') {
      const [pkgs, sends] = await Promise.all([
        supabaseAdmin.from('student_packages')
          .select('student_id, name, package_instalments(due_date, amount), students(name, enrollment_id, email, status)').eq('status', 'ACTIVE'),
        supabaseAdmin.from('digest_sends').select('key, sent_on').like('key', 'billing%').gte('sent_on', addDays(today, -31)),
      ]);
      const failed = [pkgs, sends].find(r => r.error);
      if (failed) throw failed.error;
      const lastSent = new Map<string, string>();
      if (!testTo) for (const r of sends.data ?? []) if ((lastSent.get(r.key) ?? '') < r.sent_on) lastSent.set(r.key, r.sent_on);
      const bal = await balances((pkgs.data ?? []).map(p => String(p.student_id)));
      const overdueRows: string[][] = [], weekRows: string[][] = [];
      let reminders = 0;
      for (const p of pkgs.data ?? []) {
        const s = (Array.isArray(p.students) ? p.students[0] : p.students) as { name: string; enrollment_id: string | null; email: string | null; status: string } | null;
        if (!s || !['ACTIVE', 'GROUNDED', 'SUSPENDED'].includes(s.status)) continue;
        const plan = (p.package_instalments ?? []) as Instalment[];
        const balance = bal.get(String(p.student_id)) ?? 0;
        const now = dueNow(balance, plan, today);
        const who = `${esc(s.name)}<br><span style="color:#64748b">${esc(s.enrollment_id ?? '')}</span>`;
        if (now.overdue) overdueRows.push([who, esc(formatINR(now.due))]);
        else for (const i of plan.filter(i => i.due_date >= today && i.due_date <= addDays(today, 7))) {
          const owed = dueNow(balance, plan, i.due_date).due;
          if (owed > 0) { weekRows.push([who, esc(dayLabel(i.due_date)), esc(formatINR(owed))]); break; }
        }
        const r = instalmentReminder(balance, plan, today, lastSent.get(`billing-overdue|${p.student_id}`));
        const email = (s.email ?? '').trim();
        if (!r || !EMAIL_RE.test(email)) continue;
        const key = r.kind === 'OVERDUE' ? `billing-overdue|${p.student_id}` : `billing-due|${p.student_id}|${r.dueDate}|${r.daysBefore}`;
        if (r.kind === 'UPCOMING' && lastSent.has(key)) continue; // the 18:00 run after a 06:00 send
        sentKeys.push(key);
        reminders++;
        mails.push({
          to: [email],
          subject: r.kind === 'OVERDUE' ? `Payment overdue: ${formatINR(r.amount)} on your FlightPro account` : `Reminder: ${formatINR(r.amount)} due on ${dayLabel(r.dueDate)}`,
          html: wrapEmail(`Hello ${s.name}`, r.kind === 'OVERDUE'
            ? `${formatINR(r.amount)} of your ${p.name} payment plan is overdue. Please pay the accounts office, or contact them if you have already paid.`
            : `${formatINR(r.amount)} of your ${p.name} payment plan falls due on ${dayLabel(r.dueDate)}. Please pay by then, or contact the accounts office.`,
          '', `${url.protocol}//${url.host}/dashboard/my-account`),
        });
      }
      result.billing = { overdue: overdueRows.length, dueThisWeek: weekRows.length, studentReminders: reminders };
      if ((overdueRows.length || weekRows.length) && lastSent.get('billing-digest') !== today) {
        const to = await recipients(['admin', 'super_admin', 'accounts']);
        const body = `<h3 style="font-size:15px;color:#dc2626;margin:14px 0 6px">Overdue (${overdueRows.length})</h3>${overdueRows.length ? table(['Student', 'Due now'], overdueRows) : '<p style="font-size:13px;color:#64748b">None.</p>'}`
          + `<h3 style="font-size:15px;color:#d97706;margin:14px 0 6px">Instalments due in the next 7 days (${weekRows.length})</h3>${weekRows.length ? table(['Student', 'Due on', 'Amount'], weekRows) : '<p style="font-size:13px;color:#64748b">None.</p>'}`;
        if (to.length) {
          mails.push({ to, subject: `FlightPro Fees: ${overdueRows.length} overdue · ${weekRows.length} due in 7 days (${stamp})`, html: wrapEmail('Student fees', `As of ${stamp}.`, body, `${url.protocol}//${url.host}/dashboard/accounts`) });
          sentKeys.push('billing-digest');
        }
      }
    }

    // ponytail: one batch call, Resend caps it at 100 emails; chunk if the school grows past that.
    const addresses = (list: Mail[]) => list.reduce((n, m) => n + m.to.length, 0);
    const outgoing = testTo
      ? mails.map(m => ({ ...m, to: [testTo], subject: `[TEST for ${m.to.join(', ')}] ${m.subject}` }))
      : mails.map(m => ({ ...m, to: m.to.filter(a => !/\.test$/i.test(a)) })).filter(m => m.to.length);
    result.skippedTestAddresses = testTo ? 0 : addresses(mails) - addresses(outgoing);
    if (outgoing.length > 100) console.error(`check-notifications: ${outgoing.length - 100} emails not sent (over the 100 batch limit).`);
    const batch = outgoing.slice(0, 100);
    if (batch.length) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { error } = await resend.batch.send(batch.map(m => ({ from: FROM, ...m })));
      if (error) throw new Error(`Resend: ${error.message}`);
      const { error: logError } = await supabaseAdmin.from('notification_log')
        .insert(batch.map(m => ({ type: 'DIGEST', subject: m.subject, message: m.subject, sent_to: m.to.join(', ') })));
      if (logError) console.error('check-notifications: failed to log emails:', logError.code);
    }
    // Record what went out today, so the next run neither repeats nor misses it.
    if (!testTo && sentKeys.length) {
      const { error: sendsError } = await supabaseAdmin.from('digest_sends')
        .upsert(sentKeys.map(key => ({ key, sent_on: today })), { onConflict: 'key,sent_on', ignoreDuplicates: true });
      // Loud on purpose: the emails have gone, but without this record the next
      // run would send the same reminders again. A 500 makes cron-job.org show
      // the run as failed, so someone looks.
      if (sendsError) {
        console.error('check-notifications: emails SENT but failed to record digest_sends:', sendsError.code, sendsError.message);
        return NextResponse.json({ error: 'Emails were sent, but recording them failed — reminders may repeat on the next run. See server logs.', emailsSent: batch.length }, { status: 500 });
      }
    }
    result.emailsSent = batch.length;
    console.log('check-notifications:', result);
    return NextResponse.json(result);
  } catch (error) {
    console.error('check-notifications failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
