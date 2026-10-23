// lib/help.ts — Help centre articles (UI plan Phase 1, 23 Oct; operator: "a help section ... self help for a new user").
// One list feeds both the Help page (/dashboard/help) and the "?" drawer in the header, filtered by role.
// Wording follows the tester guide v1.0 (docs/FlightPro_User_Guide_v1.0.docx). Keep it in step when a feature changes.
import {
  SCHEDULE_VIEW_ROLES, FLIGHT_RECORDS_VIEW_ROLES, AVAILABILITY_VIEW_ROLES, MAINTENANCE_VIEW_ROLES, SQUAWK_REPORT_ROLES,
  BA_TEST_VIEW_ROLES, REPORTS_VIEW_ROLES, BILLING_VIEW_ROLES, BILLING_REPORT_ROLES, STUDENT_STAFF_ROLES, PROGRESS_VIEW_ROLES,
  ROSTER_VIEW_ROLES, ADMIN_SETUP_WRITE_ROLES,
} from '@/lib/permissions';

export interface HelpArticle {
  id: string;
  topic: string;
  title: string;
  /** Pages this article belongs to (path prefixes); the "?" drawer shows the longest match. */
  paths: string[];
  /** Who sees it; omitted = everyone. */
  roles?: string[];
  body: string[];
}

export const HELP_TOPICS = ['Getting started', 'Schedule & bookings', 'Logbook', 'Fleet & maintenance', 'Training', 'Safety & compliance', 'Billing', 'Admin'];

export const HELP_ARTICLES: HelpArticle[] = [
  { id: 'sign-in', topic: 'Getting started', title: 'Signing in and your account', paths: ['/change-password'], body: [
    'Sign in with your email address or your user ID (for example d.accounts) and your password.',
    'New users get a welcome email and must change the password at the first sign-in.',
    'Click your name at the top right, then "Account (user ID & password)" to change either. "Logout" is in the same menu.',
    'Forgot your password? Use "Forgot Password?" on the sign-in page. Repeated wrong passwords lock the account for a while.',
  ] },
  { id: 'menu', topic: 'Getting started', title: 'Finding your way around', paths: ['/dashboard/help'], body: [
    'The menu on the left is grouped: Flying, Training, Fleet & Engineering, Safety & Compliance, Finance and People. Click a group to open it; the group of the page you are on opens by itself.',
    'On a laptop-width screen the menu shows one icon per group — point at an icon to see its pages by name. On a phone, use the menu button at the top left.',
    'You only see the pages your role can use. If a link says "Access Restricted", ask your school admin.',
    'The "?" at the top of every page opens help for that page.',
  ] },
  { id: 'book', topic: 'Schedule & bookings', title: 'Booking a flight', paths: ['/dashboard/schedule'], roles: SCHEDULE_VIEW_ROLES, body: [
    'Open Flying › Schedule. Click an empty space on an aircraft’s row, or "Book Slot".',
    'Pick the date and times. Bookings must sit inside the base’s opening hours and be at least 45 minutes long.',
    'Choose the aircraft, student, instructor, sortie type and exercise, then save.',
    'Students book their own slots: the student is fixed to you and the instructor is your assigned instructor. Instructors can book only if self-booking is switched on for them.',
  ] },
  { id: 'cant-book', topic: 'Schedule & bookings', title: 'Why can’t I book this?', paths: ['/dashboard/schedule'], roles: SCHEDULE_VIEW_ROLES, body: [
    'The aircraft, instructor or student is already booked at that time.',
    'The day is a holiday or a weekly off at that base.',
    'The aircraft has overdue maintenance marked "Blocks booking" (an admin can override with a reason).',
    'The instructor would go over their daily limit, is off roster, or is on approved leave.',
    'The student is grounded, suspended or has left, or has a requirement that blocks solo or all flying.',
    'If the school has switched on the funds check: the student’s balance plus credit limit doesn’t cover the booking.',
  ] },
  { id: 'cancel', topic: 'Schedule & bookings', title: 'Cancelling a booking', paths: ['/dashboard/schedule'], roles: SCHEDULE_VIEW_ROLES, body: [
    'Click the booking on the board and choose Cancel. Pick a reason; "Other" needs a note.',
    '"Student no-show" charges the no-show fee set in Admin Setup › Billing. A late-cancellation fee is charged only when an admin ticks it.',
  ] },
  { id: 'leave', topic: 'Schedule & bookings', title: 'Applying for and approving leave', paths: ['/dashboard/availability'], roles: AVAILABILITY_VIEW_ROLES, body: [
    'Open Flying › Availability & Leave and click "Add Leave". Choose the type, dates and, for part of a day, the times.',
    'Admin and Operations approve or reject requests. Approved leave blocks bookings for that person and cancels their bookings during it.',
  ] },
  { id: 'roster', topic: 'Schedule & bookings', title: 'Duty roster and duty hours', paths: ['/dashboard/roster', '/dashboard/duty-hours'], roles: ROSTER_VIEW_ROLES, body: [
    'Duty Roster sets each instructor’s weekly pattern and one-off changes for a day. Bookings outside the roster are refused.',
    'Duty Hours shows each instructor’s hours today against their daily limit. It is a school tool, not a DGCA FDTL report.',
  ] },
  { id: 'log-flight', topic: 'Logbook', title: 'Logging a flight', paths: ['/dashboard/flights'], roles: FLIGHT_RECORDS_VIEW_ROLES, body: [
    'Open Flying › Flight Records and click "Log Flight".',
    'Enter student, aircraft, instructor, date, departure and arrival times, Hobbs start and end (check the suggested end against the meter), landings, sortie, exercise, performance and notes.',
    'Saving updates the aircraft’s Hobbs and the student’s hours, and charges the student’s account (package hours first, then the hourly rate).',
    'Accounts and Maintenance users can view the logbook but not change it.',
  ] },
  { id: 'maintenance', topic: 'Fleet & maintenance', title: 'Logging and completing maintenance', paths: ['/dashboard/maintenance', '/dashboard/aircraft', '/dashboard/fuel'], roles: MAINTENANCE_VIEW_ROLES, body: [
    'Open Fleet & Engineering › Maintenance and click "Log Maintenance". Choose aircraft, type, status, assigned AME and dates; tick "Block a specific time window" to block part of a day instead of all of it.',
    'Completing a record needs a certifying engineer and a CRS reference.',
    'Items marked "Blocks booking" in the maintenance schedule stop bookings while overdue.',
    'Fuel: "Log Refueling" records litres and cost for an aircraft.',
  ] },
  { id: 'defect', topic: 'Fleet & maintenance', title: 'Reporting a defect (squawk)', paths: ['/dashboard/report-defect'], roles: SQUAWK_REPORT_ROLES, body: [
    'Open Report a Defect, choose the aircraft, describe what you noticed and click "Report Defect".',
    'Maintenance sees it straight away. "Your Reported Squawks" shows its status.',
  ] },
  { id: 'students', topic: 'Training', title: 'Students, progress and requirements', paths: ['/dashboard/students', '/dashboard/progress', '/dashboard/student', '/dashboard/instructor'], roles: [...STUDENT_STAFF_ROLES, 'student'], body: [
    'Students: filter by status or stage, or search by name or enrolment ID. Admins add students (this also creates their login) and change status.',
    'Progress: pick a student to see the requirements checklist, hours against the program’s targets and whether they are released for solo.',
    'Students see their own progress on My Dashboard.',
  ] },
  { id: 'ground-school', topic: 'Training', title: 'Ground school classes', paths: ['/dashboard/ground-school'], roles: PROGRESS_VIEW_ROLES, body: [
    'Schedule Classes shows a weekly or monthly calendar; Attendance & Exams records who attended and their results.',
    'A student can be enrolled in a class only once. Subjects with a fee charge the student’s account.',
  ] },
  { id: 'ba', topic: 'Safety & compliance', title: 'Breath Analyser (BA) register', paths: ['/dashboard/reports/breath-analyser', '/dashboard/reports/breath-analysis'], roles: BA_TEST_VIEW_ROLES, body: [
    'Pick the date to see that day’s tests. Operations and the Safety Officer add entries with "Add BA Test Entry".',
    'Export Excel/CSV downloads the day. The Breath Analysis Report gives daily, weekly or monthly roll-ups.',
  ] },
  { id: 'incidents', topic: 'Safety & compliance', title: 'Safety incidents', paths: ['/dashboard/safety'], roles: REPORTS_VIEW_ROLES, body: [
    'New incidents are logged from the Daily Flying Report page ("Report Incident").',
    'On Safety, expand an incident to set severity and likelihood (5×5 risk), the person assigned, the corrective action and the status.',
  ] },
  { id: 'dgca-reports', topic: 'Safety & compliance', title: 'Daily Flying Report and DGCA Audit Pack', paths: ['/dashboard/reports/daily-flying', '/dashboard/reports/audit-pack', '/dashboard/reports/maintenance-log', '/dashboard/reports'], roles: REPORTS_VIEW_ROLES, body: [
    'Daily Flying Report: pick a date and click "Generate Report", then export PDF or Excel/CSV.',
    'DGCA Audit Pack: one PDF for a date range with every saved Daily Flying Report, the BA register and the Maintenance Log. Days without a generated report are listed on its cover.',
  ] },
  { id: 'payments', topic: 'Billing', title: 'Recording payments and student accounts', paths: ['/dashboard/accounts'], roles: BILLING_VIEW_ROLES, body: [
    'Open Finance › Accounts and pick a student. Use "Record payment", "Opening balance", "Adjustment" or "Credit limit".',
    'Every payment gets a numbered receipt. Mistakes are never deleted: void the entry with a reason, and it stays on the ledger struck through.',
    'An invoiced charge can be refunded in full or in part with a credit note; record the payout with its date, UTR and bank.',
  ] },
  { id: 'charges', topic: 'Billing', title: 'How charges and GST work', paths: ['/dashboard/my-account', '/dashboard/accounts'], roles: [...BILLING_VIEW_ROLES, 'student'], body: [
    'A logged flight is charged at its flight time × the hourly rate for the aircraft type, plus GST. Course-package hours are used first.',
    'GST is charged only once the school has saved a valid GSTIN; it is split CGST + SGST, or IGST when the student’s state is different.',
    'Fees: no-show, late cancellation (when an admin ticks it) and ground-school subject fees.',
  ] },
  { id: 'statements', topic: 'Billing', title: 'Statements and reconciliation', paths: ['/dashboard/reports/statements', '/dashboard/reports/reconciliation', '/dashboard/my-account'], roles: ['student', ...BILLING_REPORT_ROLES], body: [
    'Statements: choose weekly, monthly, annual (April–March) or custom dates, then download the PDF. Staff can also show one student or all students (consolidated).',
    'Dr means owed to the school, Cr means money on account.',
    'Billing Reconciliation lists every logbook flight beside its charge and flags flights not charged; export CSV or PDF.',
  ] },
  { id: 'bases', topic: 'Getting started', title: 'Switching bases', paths: [], body: [
    'When the school has more than one active base, a base button appears at the top right. Click it and pick a base, or "All bases".',
    'Your choice is remembered in this browser. Instructors start on their home base.',
  ] },
  { id: 'setup', topic: 'Admin', title: 'Setting up the school (Admin Setup)', paths: ['/dashboard/admin'], roles: ADMIN_SETUP_WRITE_ROLES, body: [
    'Admin Setup has tabs for school settings, bases, holidays, programs, fleet, maintenance schedule, engineers, sortie types, exercises, requirements, ground school, instructor roles, users and billing.',
    'The menu’s Admin Setup group opens the right tab directly (School, Fleet, Training, Users, Billing).',
  ] },
];

const visible = (a: HelpArticle, role: string) => !a.roles || a.roles.includes(role);

/** Articles for the page at `path`: those with the longest matching path prefix. */
export function helpForPath(path: string, role: string): HelpArticle[] {
  let best = 0;
  const hits: { a: HelpArticle; len: number }[] = [];
  for (const a of HELP_ARTICLES) {
    if (!visible(a, role)) continue;
    const len = Math.max(0, ...a.paths.filter(p => path === p || path.startsWith(p + '/')).map(p => p.length));
    if (len > 0) { hits.push({ a, len }); best = Math.max(best, len); }
  }
  return hits.filter(h => h.len === best).map(h => h.a);
}

/** Articles whose title or text contains every word of `query` (any order, any case). */
export function searchHelp(query: string, role: string): HelpArticle[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return HELP_ARTICLES.filter(a => visible(a, role) && words.every(w => `${a.title} ${a.body.join(' ')}`.toLowerCase().includes(w)));
}
