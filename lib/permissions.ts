// lib/permissions.ts
// Pure role-list constants for the app's role/tab access matrix (2026-08-17).
//
// IMPORTANT: this file must stay free of any server-only imports (no
// lib/supabase-admin.ts, no next-auth server modules, etc.) — it's imported
// directly by 'use client' page components for RoleGate checks (see
// app/dashboard/*/page.tsx) as well as by server-side API routes (via
// lib/api-auth.ts, which re-exports everything from here). lib/api-auth.ts
// itself imports lib/supabase-admin.ts, which throws if it ever ends up in a
// browser bundle — these constants used to live there, which meant every
// client page that imported a *_VIEW_ROLES constant was pulling in that
// server-only client and would crash on load. Splitting the plain data out
// into this file is the fix; lib/api-auth.ts keeps the actual
// requireSession()/requireRole()/requireScheduleCreateAccess() request
// helpers, which are legitimately server-only.

// ============================================================
// STUDENTS
// ============================================================
// Roles that can see/manage every student, per the app's existing intended
// policy — matches the RoleGate on app/dashboard/students/page.tsx.
export const STUDENT_STAFF_ROLES = ['admin', 'instructor', 'super_admin', 'operations'];

// Roles that can create a brand-new student. Intentionally narrower than
// STUDENT_STAFF_ROLES above: creating a student now also creates their
// login (email + generated password), and login creation has always been a
// super_admin-only action everywhere else in the app (see
// app/api/admin/users/route.ts). instructor can still edit existing
// students' training profiles — they just can't mint new logins.
export const STUDENT_CREATION_ROLES = ['admin', 'super_admin'];

// Roles that can EDIT or DELETE an existing student. Narrower than
// STUDENT_STAFF_ROLES (2026-08-17 role/tab matrix): operations moved to
// view-only for Students — they still see everyone via STUDENT_STAFF_ROLES
// (GET), but can no longer change a student's record.
export const STUDENT_WRITE_ROLES = ['admin', 'instructor', 'super_admin'];

// 2026-08-29 (E2E testing round): every role for which GET /api/students
// returns something other than a 403 — i.e. STUDENT_STAFF_ROLES (full
// roster), plus 'safety_officer' (a scoped, non-PII roster projection —
// see app/api/students/route.ts) and 'student' (their own single record).
// This is a *narrower-purpose* sibling of STUDENT_STAFF_ROLES: it answers
// "can this role attempt to read student data at all" for client-side
// components that need to gate a useStudents() call so it doesn't fire a
// doomed request (e.g. StudentProgressWidget/NotificationWidget on the
// Dashboard, which render for every role with no RoleGate) — it does NOT
// govern the full Students management page, which stays on
// MODULE_ACCESS.students (STUDENT_STAFF_ROLES only) via its own RoleGate.
// Keep this in sync with app/api/students/route.ts's GET branches if
// either changes — nothing enforces the two staying aligned automatically.
//
// Added 'safety_officer' because BA_TEST_WRITE_ROLES already expects a
// safety officer to log a BA test against a specific student (impossible
// without looking one up by name — see the Breath Analyser Register's
// "Select student" dropdown), and 'operations' already had full student
// access for the same underlying reason. Deliberately did NOT add
// 'safety_officer' to STUDENT_STAFF_ROLES itself, since that also unlocks
// the full Students management page (search, DOB/phone/medical, SPL
// details) via MODULE_ACCESS — more than a safety officer needs just to
// pick a student's name off a list.
export const STUDENT_ROSTER_VIEW_ROLES = [...STUDENT_STAFF_ROLES, 'safety_officer', 'student'];

// ============================================================
// AIRCRAFT
// ============================================================
// Per the 2026-08-17 role/tab matrix: admin/instructor/super_admin/
// maintenance/operations can all see the fleet; only admin/super_admin can
// add, edit, or remove an aircraft. instructor/maintenance/operations are
// view-only on this tab.
export const AIRCRAFT_VIEW_ROLES = ['admin', 'instructor', 'super_admin', 'maintenance', 'operations'];
export const AIRCRAFT_WRITE_ROLES = ['admin', 'super_admin'];

// ============================================================
// FUEL RECORDS
// ============================================================
// maintenance keeps full read/write (their tab is literally "Maintenance &
// Fuel"). instructor/operations can view fuel logs but not add one.
export const FUEL_VIEW_ROLES = ['admin', 'instructor', 'super_admin', 'maintenance', 'operations'];
export const FUEL_WRITE_ROLES = ['admin', 'super_admin', 'maintenance'];

// ============================================================
// MAINTENANCE RECORDS
// ============================================================
export const MAINTENANCE_VIEW_ROLES = ['admin', 'instructor', 'super_admin', 'maintenance', 'operations'];
export const MAINTENANCE_WRITE_ROLES = ['admin', 'super_admin', 'maintenance'];

// ============================================================
// FLIGHT RECORDS (digital logbook)
// ============================================================
// operations isn't on this tab at all, per the role/tab matrix. maintenance
// can view the logbook but not log a flight.
export const FLIGHT_RECORDS_VIEW_ROLES = ['admin', 'instructor', 'super_admin', 'maintenance'];
export const FLIGHT_RECORDS_WRITE_ROLES = ['admin', 'instructor', 'super_admin'];

// ============================================================
// INSTRUCTORS (roster — all instructors in the FTO, not "My Students")
// ============================================================
// Per the 2026-08-17 role/tab matrix, instructor itself didn't have a tab
// for the full roster (only their own "My Students" page, which is a
// separate route with its own RoleGate) — only admin/super_admin managed
// the roster; operations could view it.
//
// 2026-08-25: reopened to view for `instructor` too, per explicit user
// decision (this was flagged as an open judgment call in the handoff doc —
// see "What's still outstanding" item 11 there). Write access is unchanged
// — instructors can now see the full roster but still can't add/edit/
// delete other instructors, same as `operations` already could.
export const INSTRUCTORS_VIEW_ROLES = ['admin', 'super_admin', 'operations', 'instructor'];
export const INSTRUCTORS_WRITE_ROLES = ['admin', 'super_admin'];

// ============================================================
// SCHEDULE — viewing the board
// ============================================================
// Per the 2026-08-17 role/tab matrix, student gains view-only access to the
// Schedule (to see their own upcoming flights) in addition to the existing
// admin/instructor/super_admin/operations staff access. This only governs
// whether the page renders at all (RoleGate) — actually creating a new
// booking is a separate, narrower check (see SCHEDULE_CREATE_ROLES below);
// students were never able to create bookings and this doesn't change that.
export const SCHEDULE_VIEW_ROLES = ['admin', 'instructor', 'super_admin', 'operations', 'student'];

// ============================================================
// SCHEDULE — creating a brand-new booking
// ============================================================
// admin/super_admin/operations can always create a booking. instructor can
// only if their own instructors.can_self_book flag has been turned on by a
// super_admin (Instructors tab — see add-instructor-self-booking-
// permission.sql). This only gates CREATING a new booking — it doesn't
// affect viewing the Schedule, or editing/debriefing/cancelling a flight
// already assigned to that instructor. Nobody else (student, maintenance)
// can create a booking at all, matching the existing Schedule RoleGate.
//
// NOTE: the instructor's can_self_book flag itself is only known/verifiable
// server-side (requireScheduleCreateAccess() in lib/api-auth.ts does the
// real check via supabaseAdmin) — this constant alone is NOT enough to
// decide client-side whether an instructor can create a booking. The
// Schedule UI additionally needs the current instructor's own canSelfBook
// field (already loaded via loadInstructors()/useFlightStore) to gate the
// "+ Book Slot" button for that one role. See ScheduleBoard.tsx.
export const SCHEDULE_CREATE_ROLES = ['admin', 'super_admin', 'operations'];

// ============================================================
// AVAILABILITY & LEAVE
// ============================================================
// Per the 2026-08-17 role/tab matrix, operations gains access to this tab
// (view + manage, same as admin/instructor/super_admin already had — the
// matrix doesn't call out a view-only restriction here the way it does for
// Aircraft/Fuel/Maintenance/Flight Records/Students).
export const AVAILABILITY_VIEW_ROLES = ['admin', 'instructor', 'super_admin', 'operations'];

// ============================================================
// STUDENT PROGRESS
// ============================================================
// Per the 2026-08-17 role/tab matrix, operations gains view access to
// Progress (View Only in the matrix) in addition to the existing staff
// access and the student's own view of their own progress (see the
// userRole === 'student' auto-select logic on the Progress page itself).
// There's no separate WRITE constant here — this page has no create/edit/
// delete actions of its own; progress is derived from flight records.
export const PROGRESS_VIEW_ROLES = ['admin', 'instructor', 'super_admin', 'student', 'operations'];

// ============================================================
// TRAINING REQUIREMENTS (2026-08-19)
// ============================================================
// Who can toggle a training_requirements row complete/incomplete — shown on
// the Progress page's Requirements Checklist (components/dashboard/
// RequirementsChecklist.tsx). Same role list the UI's own canEdit check
// already used, but this is now also enforced server-side (see
// app/api/admin/requirements/toggle/route.ts) rather than being a UI-only
// restriction — the write used to go straight from the browser to Supabase,
// which meant anyone who could reach the Supabase REST API directly could
// bypass canEdit entirely. Matters most for the safety-sensitive "Solo
// Release" requirement, but applies to every requirement toggle.
// Intentionally its own constant rather than reusing STUDENT_WRITE_ROLES —
// same values today, but a different feature area; they shouldn't
// accidentally move together if one changes for reasons specific to it.
export const REQUIREMENTS_WRITE_ROLES = ['admin', 'instructor', 'super_admin'];

// 2026-08-21 (security hardening round): the Admin Setup wizard's config
// tabs (Exercises, Training Programs, Instructor Roles, Sortie Types,
// Ground School Subjects, Requirement Templates, Holiday Calendar) used to
// write straight from the browser to Supabase with only a client-side
// RoleGate on the wizard's own page — the same "UI-only enforcement" gap
// already fixed for Solo Release/Requirements above. The wizard page itself
// already restricts entry to super_admin (see app/dashboard/admin/setup/
// page.tsx's RoleGate allowedRoles={['super_admin']}), so this mirrors that
// exact same boundary server-side via app/api/admin/config/[table]/route.ts.
export const ADMIN_SETUP_WRITE_ROLES = ['super_admin'];

// ============================================================
// PER-USER PERMISSION OVERRIDES (2026-08-17, second round)
// ============================================================
// For small FTOs with few staff, a super_admin can grant an individual
// instructor/operations/maintenance user extra access to one of the six
// modules below, beyond whatever their role's own matrix grants by
// default — e.g. one specific maintenance user who also handles fuel
// purchasing gets Full Access to Fuel Records without every maintenance
// user getting it, or without a new role being invented for one person.
// Deliberately scoped to non-staff-management roles only (see
// OVERRIDE_ELIGIBLE_ROLES) — admin/super_admin already have full access
// everywhere, and student is a different access model entirely (their own
// records, not a staff module).
//
// MODULE_ACCESS is the single source of truth mapping each overridable
// module to the exact VIEW/WRITE role arrays already defined above, so a
// role's default access and an override's effect can never silently
// disagree — both read from the same constants.
export const MODULE_ACCESS = {
  aircraft: { viewRoles: AIRCRAFT_VIEW_ROLES, writeRoles: AIRCRAFT_WRITE_ROLES, label: 'Aircraft' },
  fuel: { viewRoles: FUEL_VIEW_ROLES, writeRoles: FUEL_WRITE_ROLES, label: 'Fuel Records' },
  maintenance: { viewRoles: MAINTENANCE_VIEW_ROLES, writeRoles: MAINTENANCE_WRITE_ROLES, label: 'Maintenance Records' },
  flightRecords: { viewRoles: FLIGHT_RECORDS_VIEW_ROLES, writeRoles: FLIGHT_RECORDS_WRITE_ROLES, label: 'Flight Records' },
  instructors: { viewRoles: INSTRUCTORS_VIEW_ROLES, writeRoles: INSTRUCTORS_WRITE_ROLES, label: 'Instructors Roster' },
  // NOTE: this governs editing/deleting an EXISTING student record only —
  // it deliberately does NOT extend to creating a brand-new student, which
  // also mints a login and stays admin/super_admin-only regardless of any
  // override (see STUDENT_CREATION_ROLES and app/api/students/route.ts).
  students: { viewRoles: STUDENT_STAFF_ROLES, writeRoles: STUDENT_WRITE_ROLES, label: 'Students' },
} as const;

export type ModuleKey = keyof typeof MODULE_ACCESS;
export type ModuleAccessLevel = 'none' | 'view' | 'full';
export type PermissionOverrides = Partial<Record<ModuleKey, 'view' | 'full'>>;

// Only these three roles can ever carry an override — enforced again
// server-side when an override is actually saved (see
// app/api/admin/users/[id]/route.ts), this is also the single place the
// UI checks to decide whether to show a user the "Edit Permissions"
// action at all (see UserManagementTab.tsx).
export const OVERRIDE_ELIGIBLE_ROLES = ['instructor', 'operations', 'maintenance'];

export const MODULE_KEYS = Object.keys(MODULE_ACCESS) as ModuleKey[];

/**
 * Resolve a user's effective access level for one module: an explicit
 * per-user override always wins if present (this is what lets an override
 * grant access to a module the role can't otherwise see at all, not just
 * upgrade View Only to Full Access within a module already visible);
 * otherwise falls back to the role's own default from MODULE_ACCESS.
 */
export function getModuleAccessLevel(
  role: string | undefined | null,
  overrides: PermissionOverrides | null | undefined,
  moduleKey: ModuleKey
): ModuleAccessLevel {
  const override = overrides?.[moduleKey];
  if (override === 'full' || override === 'view') return override;

  if (!role) return 'none';
  const cfg = MODULE_ACCESS[moduleKey];
  if (cfg.writeRoles.includes(role)) return 'full';
  if (cfg.viewRoles.includes(role)) return 'view';
  return 'none';
}

export function canViewModule(
  role: string | undefined | null,
  overrides: PermissionOverrides | null | undefined,
  moduleKey: ModuleKey
): boolean {
  return getModuleAccessLevel(role, overrides, moduleKey) !== 'none';
}

export function canWriteModule(
  role: string | undefined | null,
  overrides: PermissionOverrides | null | undefined,
  moduleKey: ModuleKey
): boolean {
  return getModuleAccessLevel(role, overrides, moduleKey) === 'full';
}

// ============================================================
// REPORTS (2026-08-18) — DGCA-facing compliance reports, starting with
// the Daily Flying Report.
// ============================================================
// Not part of the six-module MODULE_ACCESS/per-user-override system above
// — these are operational/compliance documents, not a data table with its
// own CRUD, so a per-user override didn't seem like the right fit. Default
// assumption (not yet confirmed against a real DGCA requirement, flagged
// for review): everyone who works the flight line day-to-day — including
// maintenance, who needs to reach this page to log a safety incident even
// though they have no write access to the report itself — can SEE the
// day's report, but actually generating/saving the official snapshot for
// a date is restricted to the roles who already run day-to-day operations
// (admin/super_admin/operations).
//
// 'safety_officer' (2026-08-20, added for the Breath Analyser Register —
// see BA_TEST_WRITE_ROLES below) is included here too so that role can
// reach the Reports landing page and see the Daily Flying Report/Safety
// Incident log at the same view-only level maintenance already has —
// there's no reason to carve out a narrower view for them just for the
// pages they don't write to.
export const REPORTS_VIEW_ROLES = ['admin', 'instructor', 'super_admin', 'operations', 'maintenance', 'safety_officer'];
export const REPORTS_WRITE_ROLES = ['admin', 'super_admin', 'operations'];

// Logging a new safety incident follows the same (deliberately broad) set
// as REPORTS_VIEW_ROLES — anyone who can see the Daily Flying Report page
// can also log an incident from it, since that's the only place this
// action lives today. Kept as its own named constant (rather than every
// call site just reusing REPORTS_VIEW_ROLES directly) so the two can be
// pulled apart later without hunting down every reference, if incident
// reporting ever needs a different rule than viewing the report does.
export const INCIDENT_REPORT_ROLES = REPORTS_VIEW_ROLES;

// 2026-08-31: who can triage a logged incident — assign the 5x5 risk
// rating, write a corrective action, and move its status (open/in-progress/
// closed). Deliberately narrower than INCIDENT_REPORT_ROLES (anyone who
// works the flight line can report one; only the safety-management side
// can manage the workflow after that). Per explicit user decision: safety
// managers = operations + safety_officer + admin/super_admin. Notably
// excludes 'instructor' and 'maintenance', who can still report/view.
export const INCIDENT_MANAGE_ROLES = ['operations', 'safety_officer', 'admin', 'super_admin'];

// 2026-08-31 enhancement: structured category, chosen at report time,
// replacing free-text. The three *_TECHNICAL categories auto-suggest
// assigned_to='Maintenance' on report (app/api/safety-incidents/route.ts)
// and are the categories Maintenance's narrow resolve action is meant for
// — nothing server-side actually restricts the resolve action to these,
// since the assignment is just a starting suggestion a manager can change.
export const SAFETY_INCIDENT_CATEGORIES = [
  { value: 'BIRD_STRIKE', label: 'Bird Strike', technical: true },
  { value: 'MECHANICAL_SYSTEMS', label: 'Mechanical / Systems Problem', technical: true },
  { value: 'OTHER_TECHNICAL', label: 'Other Technical', technical: true },
  { value: 'OPERATIONAL', label: 'Operational', technical: false },
  { value: 'OTHER', label: 'Other', technical: false },
] as const;
export const TECHNICAL_INCIDENT_CATEGORIES: string[] =
  SAFETY_INCIDENT_CATEGORIES.filter(c => c.technical).map(c => c.value);

// Maintenance's narrow slice of incident-management power (per explicit
// user decision): add a resolution note and mark an incident RESOLVED.
// Deliberately NOT added to INCIDENT_MANAGE_ROLES — maintenance still
// can't risk-rate, reassign, or CLOSE (that's the reporter or a manager;
// see the close-authority check in app/api/safety-incidents/[id]/route.ts).
export const INCIDENT_RESOLVE_ROLES = ['maintenance'];

// ============================================================
// PILOT-FACING SQUAWK REPORTING (2026-08-31)
// ============================================================
// Who can file a maintenance defect ("squawk") against an aircraft via the
// restricted-field path in app/api/maintenance-records/route.ts, without
// needing MAINTENANCE_WRITE_ROLES. Per explicit user decision: instructors
// and students (any pilot who might fly the aircraft) — not operations,
// which already has full staff visibility elsewhere. A squawk filed this
// way always lands with status SCHEDULED and is_squawk=true for staff to
// triage; the reporter cannot set cost/performedBy/completedDate etc.
export const SQUAWK_REPORT_ROLES = ['instructor', 'student'];

// ============================================================
// BREATH ANALYSER (BA) TEST REGISTER (2026-08-20)
// ============================================================
// Who can view the register — same broad set as the rest of Reports.
// Who can add/edit an entry — deliberately narrow, per the FTO's own spec.
// 2026-08-26: narrowed further, per explicit user correction — write
// access is now 'operations' and 'safety_officer' ONLY. 'admin' and
// 'super_admin' previously had write access too (the original 2026-08-20
// spec); the FTO flagged that as a defect and asked for it removed, so
// even admin/super_admin can no longer add/edit/delete a BA entry —
// they still retain VIEW access via BA_TEST_VIEW_ROLES below, same as
// instructor/maintenance. If a future admin genuinely needs to correct an
// entry, that has to go through operations or a safety_officer user, by
// design — this is a deliberate compliance-record control, not an
// oversight to "fix" back to the old broader list.
export const BA_TEST_VIEW_ROLES = REPORTS_VIEW_ROLES;
export const BA_TEST_WRITE_ROLES = ['operations', 'safety_officer'];

// ============================================================
// USER ACCOUNTS (login roles) — super_admin-only User Management tab
// ============================================================
// The set of roles a login account can be created/edited into from
// app/dashboard/admin/setup/UserManagementTab.tsx. 'student' is
// deliberately excluded — students are created as a single unit (login +
// training profile together) from the Students page, not here; see the
// note by the role dropdown in UserManagementTab.tsx.
//
// Previously duplicated as two separately-hand-maintained lists (one with
// labels in UserManagementTab.tsx, one values-only in
// app/api/admin/users/route.ts) that had to be kept in sync by hand —
// centralized here (2026-08-20, edit-user round) so both the create form,
// the new edit-user modal, and both API routes (POST for create, PATCH
// .../[id] for edit) share one source of truth.
export const USER_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'admin', label: '👑 Admin' },
  { value: 'instructor', label: '👨‍🏫 Instructor' },
  { value: 'operations', label: '📋 Operations' },
  { value: 'maintenance', label: '🔧 Maintenance' },
  { value: 'safety_officer', label: '🦺 Safety Officer' },
  { value: 'super_admin', label: '🔧 Super Admin' },
];
export const VALID_USER_ROLES: string[] = USER_ROLE_OPTIONS.map(r => r.value);