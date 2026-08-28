-- add-dummy-student2-account.sql
-- ---------------------------------------------------------------------------
-- Creates a SECOND dummy student login for testing — needed specifically to
-- exercise the Ground School Progress IDOR fix (?student= URL override),
-- which requires two distinct student identities: log in as student A, try
-- to view student B's progress via the URL param, confirm it's ignored and
-- the page still shows only A's own data.
--
--   Login:    dummy.student2@flightpro.test
--   Password: Flight@2026
--   Role:     student
--   force_password_reset: FALSE — will NOT be forced to change password on
--                          first login (per request; every other dummy
--                          account so far sets this true).
--
-- Run this in the Supabase SQL Editor for the production project (same place
-- the other add-*.sql files in this repo were run) — it needs pgcrypto and
-- service-role-level DB access that a plain client connection doesn't have.
--
-- WHY A SQL SCRIPT INSTEAD OF THE APP'S OWN "ADD STUDENT" UI: the UI's
-- create-student flow (app/api/students/route.ts) always generates a random
-- password, emails it, and always sets force_password_reset = true — there's
-- no way to hand it a fixed password with reset skipped short of editing the
-- row afterward anyway. This does the same two-table write
-- (students + users, linked via users.student_id) directly, in one shot,
-- with exactly the values you asked for.
--
-- SAFETY: this is ONE atomic SQL statement — if the final `users` insert
-- fails for any reason (e.g. dummy.student2@flightpro.test already exists),
-- Postgres rolls back the `students` insert too. No orphaned row either way.
-- Nothing here touches or affects dummy.student@flightpro.test or any other
-- existing account.
-- ---------------------------------------------------------------------------

-- pgcrypto gives us crypt()/gen_salt('bf', 10) — a bcrypt hash at cost 10,
-- the exact same cost factor the app's own bcrypt.hash(password, 10) uses
-- (see lib/auth.ts's bcrypt.compare() and app/api/students/route.ts). The
-- bcryptjs library the app runs on reads pgcrypto's $2a$ output natively, so
-- this password will just work at /login — no extra conversion needed.
create extension if not exists pgcrypto;

with new_student as (
  insert into students (
    enrollment_id,
    name,
    initials,
    training_stage,
    total_hours,
    medical_expiry,
    email,
    phone,
    date_of_birth,
    joined_date,
    status,
    spl_number,
    spl_expiry_date,
    spl_issue_date,
    medical_issue_date
  )
  values (
    'DUMMY-STU-002',
    'Dummy Student Two',
    'DS2',
    'PPL',
    0,
    null,
    'dummy.student2@flightpro.test',
    null,
    null,
    current_date,
    'ACTIVE',
    null,
    null,
    null,
    null
  )
  returning id
)
insert into users (
  email,
  password_hash,
  name,
  role,
  student_id,
  is_active,
  force_password_reset
)
select
  'dummy.student2@flightpro.test',
  crypt('Flight@2026', gen_salt('bf', 10)),
  'Dummy Student Two',
  'student',
  new_student.id,
  true,
  false  -- do NOT force a password reset on first login
from new_student;

-- ---------------------------------------------------------------------------
-- VERIFY: confirm both rows landed and are linked correctly.
-- ---------------------------------------------------------------------------
-- select u.email, u.role, u.is_active, u.force_password_reset, u.student_id,
--        s.id as students_id, s.name, s.email as student_email
-- from users u
-- join students s on s.id = u.student_id
-- where u.email = 'dummy.student2@flightpro.test';

-- ---------------------------------------------------------------------------
-- CLEANUP (if you ever want to remove this test account — commented out on
-- purpose, uncomment and run deliberately):
-- ---------------------------------------------------------------------------
-- delete from users where email = 'dummy.student2@flightpro.test';
-- delete from students where email = 'dummy.student2@flightpro.test';
