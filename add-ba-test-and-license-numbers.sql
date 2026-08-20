-- add-ba-test-and-license-numbers.sql
-- ============================================================
-- Breath Analyser (BA) Test Register (2026-08-20) — the FTO shared the
-- actual prescribed register format (columns: Aircraft Flying, Safety
-- Officer, Student/Instructor, Name, License Number, Reporting Time, BA
-- Time, BA Percentage, BA Equipment), so this builds the "Breath Analyser
-- Register" card on the Reports page that's been listed there as a
-- placeholder since the Reports section was first built. See
-- app/dashboard/reports/breath-analyser/page.tsx.
--
-- Two things this script does:
--
-- 1) Adds `spl_number` to `students` — the student's Student Pilot
--    License number, shown as the "License Number" column when the BA
--    Test's Student/Instructor field is a student. Same design as the
--    existing `dgca_roll_number` on ground_school_enrollment: pulled
--    automatically from the person's own profile rather than typed in
--    fresh on every BA test (2026-08-20 design decision — matches this
--    codebase's running "don't hand-retype what's already on file"
--    philosophy). For an instructor, the equivalent License Number is
--    the CPL number they already have on file — `instructors.license_number`
--    (no schema change needed there, that column already exists).
--
-- 2) Creates `ba_tests` — one row per person tested per day. Deliberately
--    NOT a "snapshot" table like daily_flying_reports (there's no derived
--    day-level summary to freeze) — just a plain append/edit log, closer
--    in shape to `safety_incidents`. person_id/person_name/license_number
--    are denormalized at the time of entry (same convention
--    safety_incidents already uses for student_id/student_name/
--    instructor_id/instructor_name) so a later edit to someone's profile,
--    or their removal from the roster, doesn't silently rewrite history
--    on a past BA test record.
--
-- Every ID column below is plain text, not a foreign key — same
-- deliberate convention as every other table in this project (see
-- add-reports-module.sql's note on this).
--
-- HOW TO RUN:
-- Supabase dashboard -> SQL Editor -> paste this whole file -> Run.
-- Safe to re-run (IF NOT EXISTS / idempotent).
--
-- NOTE ON RLS: new Supabase tables auto-enable Row Level Security, which
-- blocks the anon-key path — but ba_tests is never read/written directly
-- from the browser anyway (see app/api/ba-tests/route.ts, which uses
-- supabaseAdmin under a role check, following the same secure pattern
-- app/api/students/route.ts and app/api/safety-incidents/route.ts already
-- use). RLS is disabled below regardless, matching every other table in
-- this project, so a future direct-client read/write attempt fails
-- loud/obvious (0 rows) rather than being silently blocked by a policy
-- gap the way training_requirement_templates was (see that incident in
-- the third-round handoff notes) if this table is ever queried directly.
-- ============================================================

-- 1) SPL number on students -----------------------------------------------

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS spl_number text;

COMMENT ON COLUMN students.spl_number IS
  'The student''s Student Pilot License (SPL) number. Shown as the "License Number" on the Breath Analyser Register when this student is the person tested. Nullable — not every student has flown solo/holds an SPL yet. Editable in the Add/Edit Student form (Students page).';

-- 2) Breath Analyser Test register -----------------------------------------

create table if not exists ba_tests (
  id bigint generated always as identity primary key,
  test_date date not null,
  aircraft_id text,
  aircraft_reg text,
  safety_officer_id text,
  safety_officer_name text not null,
  person_type text not null check (person_type in ('STUDENT', 'INSTRUCTOR')),
  person_id text,
  person_name text not null,
  license_number text,
  reporting_time text,
  ba_time text,
  ba_percentage numeric,
  ba_equipment text,
  recorded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table ba_tests is
  'Pre-flight Breath Analyser (BA) test log per CAR Section 5, Series F, Part III — the Breath Analyser Register on the Reports page. One row per person tested. Editable/correctable after creation (updated_at), unlike the append-only safety_incidents log this table otherwise mirrors in shape.';

create index if not exists idx_ba_tests_date on ba_tests (test_date);

alter table ba_tests disable row level security;

-- Verify: should show both the new students column and the new table.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'students' AND column_name = 'spl_number';

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ba_tests'
ORDER BY ordinal_position;
