-- roster-per-base.sql
-- Multi-base M4a (15 Oct; claude/multi-base-design-2026-10-15.md, decision 8):
-- the duty roster is per base. One weekly row per instructor PER BASE per
-- weekday, and one one-off change per instructor PER BASE per date.
--
-- CONSTRAINT CHANGE ONLY - no row is added, changed or deleted:
--   1. base_id becomes NOT NULL on both roster tables. Every existing row
--      already has 1 (the column default since add-bases.sql), so nothing
--      changes; if any row were NULL this step fails and nothing is applied.
--   2. Each unique rule gains base_id:
--        instructor_roster_one_per_day            (instructor_id, weekday)
--          -> (instructor_id, base_id, weekday)
--        instructor_roster_exceptions_one_per_date (instructor_id, date)
--          -> (instructor_id, base_id, date)
--      The new rules are looser, so every existing row still satisfies them.
-- All in one transaction: either everything applies or nothing does.
--
-- Run it immediately before deploying the M4a code. In between, saving a
-- roster fails (the old code names the old rule); nothing else is affected.
--
-- Reversible while no instructor has rows at two bases:
--   alter table public.instructor_roster drop constraint instructor_roster_one_per_day,
--     add constraint instructor_roster_one_per_day unique (instructor_id, weekday);
--   alter table public.instructor_roster_exceptions drop constraint instructor_roster_exceptions_one_per_date,
--     add constraint instructor_roster_exceptions_one_per_date unique (instructor_id, date);

begin;

alter table public.instructor_roster alter column base_id set not null;
alter table public.instructor_roster_exceptions alter column base_id set not null;

alter table public.instructor_roster
  drop constraint instructor_roster_one_per_day,
  add constraint instructor_roster_one_per_day unique (instructor_id, base_id, weekday);

alter table public.instructor_roster_exceptions
  drop constraint instructor_roster_exceptions_one_per_date,
  add constraint instructor_roster_exceptions_one_per_date unique (instructor_id, base_id, date);

commit;

-- Check (read-only): both rules now include base_id; the row counts are unchanged.
select conname, pg_get_constraintdef(oid) as rule,
       (select count(*) from public.instructor_roster) as weekly_rows,
       (select count(*) from public.instructor_roster_exceptions) as exception_rows
from pg_constraint
where conname in ('instructor_roster_one_per_day', 'instructor_roster_exceptions_one_per_date');
