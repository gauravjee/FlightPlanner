-- add-atomic-student-hours-increment.sql
-- P0 #5 (2026-09-18) — audit finding C4: "Concurrent flight logs silently
-- lose hours". app/api/flight-records/route.ts credited a student's
-- students.total_hours with a plain read-modify-write: SELECT total_hours,
-- add this flight's hours in application code, UPDATE. Two flights logged
-- for the same student seconds apart both read the same starting value;
-- whichever UPDATE lands second overwrites the first's result instead of
-- compounding it. No error, no conflict — just a silently wrong total on a
-- DGCA-relevant figure.
--
-- Fixed by moving the increment into a single atomic UPDATE, done inside
-- Postgres via this function rather than two round-trips from the app.
-- Postgres serializes concurrent UPDATEs to the same row via its normal row
-- lock, so two overlapping calls now compound correctly instead of racing.
--
-- Also folds in the first-solo-date logic (previously a separate
-- application-level "only set it if it's not already set" check) via
-- COALESCE, which is race-free the same way: the read and the conditional
-- write happen in the same statement, under the same row lock.
--
-- ADDITIVE ONLY: creates one new function, touches no existing data. No
-- approval-before-running needed under the project's destructive-change
-- rule, but flagged here per that rule's own "say so when handing it over"
-- requirement.
--
-- p_student_id is text rather than matching students.id's exact column
-- type — id::text comparison works regardless of whether that column is
-- uuid, bigint, or text, so this doesn't need to guess the schema.
create or replace function public.increment_student_hours(
  p_student_id text,
  p_hours numeric,
  p_first_solo_date date default null
)
returns void
language sql
as $$
  update public.students
  set total_hours = coalesce(total_hours, 0) + p_hours,
      first_solo_date = coalesce(first_solo_date, p_first_solo_date)
  where id::text = p_student_id;
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC by default, and
-- Supabase's PostgREST auto-exposes every function in the public schema as
-- a POST /rest/v1/rpc/<name> endpoint. Without these revokes, this would be
-- callable with the anon key to arbitrarily inflate (or, via a negative
-- p_hours, deflate) any student's total_hours — exactly the class of gap
-- the 2026-09-18 RLS remediation closed everywhere else. Only the
-- service-role-backed server route calls this, so only service_role needs
-- EXECUTE.
revoke execute on function public.increment_student_hours(text, numeric, date) from public;
revoke execute on function public.increment_student_hours(text, numeric, date) from anon;
revoke execute on function public.increment_student_hours(text, numeric, date) from authenticated;
grant execute on function public.increment_student_hours(text, numeric, date) to service_role;
