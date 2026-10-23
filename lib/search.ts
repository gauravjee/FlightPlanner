// lib/search.ts — "Go to anything" search (UI plan Phase 2a, 23 Oct): pages, tasks and help, matched in the browser.
// Pages come from the role-filtered menu (Sidebar's useVisibleNavGroups), so search can never offer a page the menu hides.
// Tasks name the page where the action is; the page's own button still does the work (and the server still checks roles).
import {
  type ModuleKey, SCHEDULE_VIEW_ROLES, FLIGHT_RECORDS_WRITE_ROLES, BILLING_RECORD_ROLES, BILLING_ADMIN_ROLES,
  BILLING_PACKAGE_ROLES, AVAILABILITY_VIEW_ROLES, AVAILABILITY_APPROVER_ROLES, MAINTENANCE_WRITE_ROLES, FUEL_WRITE_ROLES,
  SQUAWK_REPORT_ROLES, BA_TEST_WRITE_ROLES, INCIDENT_REPORT_ROLES, REPORTS_WRITE_ROLES, REPORTS_VIEW_ROLES,
  STUDENT_CREATION_ROLES, GROUND_SCHOOL_WRITE_ROLES, ROSTER_EDIT_ROLES, ADMIN_SETUP_WRITE_ROLES,
} from '@/lib/permissions';

export type SearchKind = 'Pages' | 'Tasks' | 'Records' | 'Help';
export interface SearchEntry { kind: SearchKind; label: string; href: string; hint: string; keywords?: string }
export interface SearchTask { label: string; href: string; hint: string; roles: string[]; moduleKey?: ModuleKey; keywords?: string }

/** Extra words people type for a page (matched as well as its name and menu group). Keyed by the page's path. */
export const PAGE_KEYWORDS: Record<string, string> = {
  '/dashboard': 'home weather notam alerts',
  '/dashboard/student': 'home my progress hours',
  '/dashboard/schedule': 'book booking slot gantt board calendar flights today',
  '/dashboard/flights': 'logbook log hobbs debrief sortie',
  '/dashboard/availability': 'leave vacation holiday sick off absent',
  '/dashboard/roster': 'duty shift pattern',
  '/dashboard/duty-hours': 'fdtl duty limit hours',
  '/dashboard/students': 'trainee cadet pilot enrolment',
  '/dashboard/instructor': 'my students debriefs',
  '/dashboard/progress': 'requirements solo release checklist targets',
  '/dashboard/ground-school': 'classes exams attendance theory subjects',
  '/dashboard/aircraft': 'fleet plane registration vt hobbs',
  '/dashboard/maintenance': 'snag squawk defect ame crs inspection overhaul due overdue',
  '/dashboard/fuel': 'refuel refuelling avgas litres',
  '/dashboard/report-defect': 'squawk snag defect fault',
  '/dashboard/safety': 'incident occurrence risk sms',
  '/dashboard/reports/breath-analyser': 'ba breathalyser breath alcohol test',
  '/dashboard/reports/daily-flying': 'dfr daily report dgca',
  '/dashboard/reports/audit-pack': 'dgca audit pdf',
  '/dashboard/reports/maintenance-log': 'ca form 19 crs dgca',
  '/dashboard/reports/breath-analysis': 'ba breath report rollup',
  '/dashboard/accounts': 'payment money balance fees dues ledger receipt invoice',
  '/dashboard/my-account': 'balance payment receipt invoice fees',
  '/dashboard/reports/statements': 'statement ledger pdf balance',
  '/dashboard/reports/reconciliation': 'recon charged uncharged billing',
  '/dashboard/instructors': 'fi cfi afi',
  '/dashboard/staff': 'employee staff id hr',
  '/dashboard/reports': 'reports',
  '/dashboard/help': 'help how guide support',
};

/** Admin Setup tabs (ids match app/dashboard/admin/setup/page.tsx TABS); super admin only. */
export const SETUP_TABS: [string, string, string?][] = [
  ['settings', 'FTO Settings', 'school name airport icao notam'], ['bases', 'Bases', 'multi-base airfield'],
  ['programs', 'Training Programs', 'ppl cpl ir course'], ['aircraft', 'Aircraft Fleet', 'add aircraft'],
  ['maintenance-schedule', 'Aircraft Maintenance Schedule', 'tbo inspection interval'], ['ames', 'Certifying Engineers', 'ame crs'],
  ['sorties', 'Sortie Types', 'dual solo'], ['exercises', 'Exercises', 'ccts briefing sop'],
  ['requirements', 'Requirements & Solo Release', 'solo release'], ['roles', 'Instructor Roles', 'fi cfi'],
  ['users', 'User Management', 'login account password create user'], ['groundschool', 'Ground School Subjects', 'subjects fee'],
  ['holidays', 'Holiday Calendar', 'closed holiday'], ['billing', 'Billing', 'rates gst gstin invoice packages fees'],
];

const SETUP = (tab: string) => `/dashboard/admin/setup?tab=${tab}`;
export const SEARCH_TASKS: SearchTask[] = [
  { label: 'Book a flight', href: '/dashboard/schedule', hint: 'Schedule › Book Slot', roles: SCHEDULE_VIEW_ROLES, keywords: 'slot booking new' },
  { label: 'Log a flight', href: '/dashboard/flights', hint: 'Flight Records › Log Flight', roles: FLIGHT_RECORDS_WRITE_ROLES, moduleKey: 'flightRecords', keywords: 'logbook debrief hobbs' },
  { label: 'Record a payment', href: '/dashboard/accounts', hint: 'Accounts › pick a student › Record payment', roles: BILLING_RECORD_ROLES, keywords: 'pay receipt upi cash cheque' },
  { label: 'Refund a charge (credit note)', href: '/dashboard/accounts', hint: 'Accounts › pick a student › Refund on the charge', roles: BILLING_ADMIN_ROLES, keywords: 'refund credit note payout' },
  { label: 'Assign a course package', href: '/dashboard/accounts', hint: 'Accounts › pick a student › Assign package', roles: BILLING_PACKAGE_ROLES, keywords: 'package instalment' },
  { label: 'Apply for leave', href: '/dashboard/availability', hint: 'Availability & Leave › Add Leave', roles: AVAILABILITY_VIEW_ROLES, keywords: 'leave vacation sick' },
  { label: 'Approve leave', href: '/dashboard/availability', hint: 'Availability & Leave › Approve', roles: AVAILABILITY_APPROVER_ROLES, keywords: 'leave approve reject' },
  { label: 'Log maintenance', href: '/dashboard/maintenance', hint: 'Maintenance › Log Maintenance', roles: MAINTENANCE_WRITE_ROLES, moduleKey: 'maintenance', keywords: 'inspection crs snag' },
  { label: 'Log refuelling', href: '/dashboard/fuel', hint: 'Fuel › Log Refueling', roles: FUEL_WRITE_ROLES, moduleKey: 'fuel', keywords: 'fuel refuel avgas' },
  { label: 'Report a defect', href: '/dashboard/report-defect', hint: 'Report a Defect', roles: SQUAWK_REPORT_ROLES, keywords: 'squawk snag' },
  { label: 'Add a BA test entry', href: '/dashboard/reports/breath-analyser', hint: 'BA Test Register › Add BA Test Entry', roles: BA_TEST_WRITE_ROLES, keywords: 'breath alcohol breathalyser' },
  { label: 'Report a safety incident', href: '/dashboard/reports/daily-flying', hint: 'Daily Flying Report › Report Incident', roles: INCIDENT_REPORT_ROLES, keywords: 'incident occurrence' },
  { label: 'Generate the Daily Flying Report', href: '/dashboard/reports/daily-flying', hint: 'Daily Flying Report › Generate Report', roles: REPORTS_WRITE_ROLES, keywords: 'dfr dgca' },
  { label: 'Export the DGCA Audit Pack', href: '/dashboard/reports/audit-pack', hint: 'DGCA Audit Pack › Export', roles: REPORTS_VIEW_ROLES, keywords: 'audit pdf' },
  { label: 'Add a student', href: '/dashboard/students', hint: 'Students › Add Student', roles: STUDENT_CREATION_ROLES, keywords: 'enrol new trainee' },
  { label: 'Schedule a ground-school class', href: '/dashboard/ground-school', hint: 'Ground School › Schedule Classes', roles: GROUND_SCHOOL_WRITE_ROLES, keywords: 'class lecture' },
  { label: 'Change the duty roster', href: '/dashboard/roster', hint: 'Duty Roster', roles: ROSTER_EDIT_ROLES, keywords: 'roster shift' },
  { label: 'Download my statement', href: '/dashboard/reports/statements', hint: 'Statements › PDF', roles: ['student'], keywords: 'statement pdf' },
  { label: 'Change my password or user ID', href: '/change-password', hint: 'Account menu › Account', roles: ['admin', 'instructor', 'super_admin', 'operations', 'maintenance', 'safety_officer', 'student', 'accounts'], keywords: 'password user id account' },
  { label: 'Create a user login', href: SETUP('users'), hint: 'Admin Setup › User Management', roles: ADMIN_SETUP_WRITE_ROLES, keywords: 'user login account' },
  { label: 'Add a holiday', href: SETUP('holidays'), hint: 'Admin Setup › Holiday Calendar', roles: ADMIN_SETUP_WRITE_ROLES, keywords: 'holiday closed' },
  { label: 'Set flying rates and GST', href: SETUP('billing'), hint: 'Admin Setup › Billing', roles: ADMIN_SETUP_WRITE_ROLES, keywords: 'rates gst gstin price' },
];

const ORDER: SearchKind[] = ['Tasks', 'Pages', 'Records', 'Help'];

/** Entries where every word of `query` starts a word of the label, hint or extra words (any order; "book" no longer
 *  finds "logbook"), best first: label starts with the query, then a label word does, then anywhere. */
export function searchEntries(entries: SearchEntry[], query: string, limit = 12): SearchEntry[] {
  const q = query.trim().toLowerCase();
  const words = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!words.length) return [];
  const scored = entries.flatMap(e => {
    const label = e.label.toLowerCase();
    const tokens = `${label} ${e.hint} ${e.keywords ?? ''}`.toLowerCase().split(/[^\p{L}\p{N}]+/u);
    if (!words.every(w => tokens.some(t => t.startsWith(w)))) return [];
    const score = label.startsWith(q) ? 3 : label.split(/[\s›&/-]+/).some(t => t.startsWith(words[0])) ? 2 : 1;
    return [{ e, score }];
  });
  scored.sort((a, b) => b.score - a.score || ORDER.indexOf(a.e.kind) - ORDER.indexOf(b.e.kind));
  return scored.slice(0, limit).map(s => s.e);
}

/** The record-search text made safe for a PostgREST ilike filter: letters, digits, space and - . / ' only (no % _ , ( ) "),
 *  at most 40 characters. '' when fewer than 2 characters are left (the server then searches nothing). */
export function cleanRecordQuery(q: string): string {
  const c = q.replace(/[^\p{L}\p{N} \-./']+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  return c.length >= 2 ? c : '';
}
