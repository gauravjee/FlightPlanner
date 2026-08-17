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
