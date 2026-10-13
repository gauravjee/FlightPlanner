-- add-person-links.sql (2026-10-14) — FK Phase C (claude/fk-design-2026-10-08.md): either-person links.
-- availability and ba_tests keep person_type + person_id (the app reads and writes those unchanged).
-- Each table gets two GENERATED columns, instructor_id and student_id, computed from them,
-- each with a real foreign key. So the database now refuses a leave or breath-test record for
-- a person who doesn't exist, and refuses to delete a person who has such records.
-- No stored value is changed: the new columns are computed. If any existing row points at a
-- missing person or has an unexpected type, the whole script fails and nothing is applied.
-- The person_type checks (lower case in availability, upper case in ba_tests) already exist (found 14 Oct).
-- Reversible: drop the 4 columns.
begin;

alter table public.availability
  add column instructor_id bigint generated always as (case when person_type = 'instructor' then person_id::bigint end) stored
    constraint availability_instructor_fk references public.instructors(id) on delete restrict,
  add column student_id uuid generated always as (case when person_type = 'student' then person_id::uuid end) stored
    constraint availability_student_fk references public.students(id) on delete restrict;

-- ba_tests.person_id may be blank: the register can record someone without a profile (name only).
alter table public.ba_tests
  add column instructor_id bigint generated always as (case when person_type = 'INSTRUCTOR' then nullif(person_id, '')::bigint end) stored
    constraint ba_tests_instructor_fk references public.instructors(id) on delete restrict,
  add column student_id uuid generated always as (case when person_type = 'STUDENT' then nullif(person_id, '')::uuid end) stored
    constraint ba_tests_student_fk references public.students(id) on delete restrict;

commit;
