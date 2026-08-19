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
// Per the 2026-08-17 role/tab matrix, instructor itself doesn't have a tab
// for the full roster (only their own "My Students" page, which is a
// separate route with its own RoleGate) — only admin/super_admin manage
// the roster; operations can view it.
export const INSTRUCTORS_VIEW_ROLES = ['admin', 'super_admin', 'operations'];
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
export const REPORTS_VIEW_ROLES = ['admin', 'instructor', 'super_admin', 'operations', 'maintenance'];
export const REPORTS_WRITE_ROLES = ['admin', 'super_admin', 'operations'];

// Logging a new safety incident follows the same (deliberately broad) set
// as REPORTS_VIEW_ROLES — anyone who can see the Daily Flying Report page
// can also log an incident from it, since that's the only place this
// action lives today. Kept as its own named constant (rather than every
// call site just reusing REPORTS_VIEW_ROLES directly) so the two can be
// pulled apart later without hunting down every reference, if incident
// reporting ever needs a different rule than viewing the report does.
export const INCIDENT_REPORT_ROLES = REPORTS_VIEW_ROLES;