-- add-instructor-roster.sql
-- 2026-09-23. ADDITIVE ONLY — no approval-before-running needed under the
-- destructive-change rule: creates two new, empty tables and adds one new
-- column with a default; no existing value is changed or deleted (existing
-- flights read roster_override = false).
--
-- WHY: the instructor duty roster (claude/duty-roster-design-2026-09-23.md).
--  - instructor_roster: the weekly pattern, one row per instructor per
--    weekday (0 = Sunday … 6 = Saturday). Both times NULL = off that day.
--    An instructor with no rows at all is on duty during FTO opening hours.
--  - instructor_roster_exceptions: one-off changes for a single date —
--    different hours, or both times NULL = off that day.
--  - scheduled_flights.roster_override: an admin/super admin booked this
--    flight outside the instructor's duty hours on purpose.
-- Removing an instructor removes their roster rows too (on delete cascade).
-- RLS on with no policies, same as every other table — the app reads and
-- writes through server routes with the service role.
--
-- REVERSIBLE:
--   drop table public.instructor_roster_exceptions;
--   drop table public.instructor_roster;
--   alter table public.scheduled_flights drop column roster_override;
--
-- Safe to re-run: IF NOT EXISTS everywhere.

create table if not exists public.instructor_roster (
  id bigint generated always as identity primary key,
  instructor_id bigint not null references public.instructors(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time,
  end_time time,
  updated_by text default '',
  updated_at timestamptz not null default now(),
  constraint instructor_roster_times_check check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  ),
  constraint instructor_roster_one_per_day unique (instructor_id, weekday)
);

create table if not exists public.instructor_roster_exceptions (
  id bigint generated always as identity primary key,
  instructor_id bigint not null references public.instructors(id) on delete cascade,
  date date not null,
  start_time time,
  end_time time,
  note text default '',
  created_by text default '',
  created_at timestamptz not null default now(),
  constraint instructor_roster_exceptions_times_check check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  ),
  constraint instructor_roster_exceptions_one_per_date unique (instructor_id, date)
);

alter table public.instructor_roster enable row level security;
alter table public.instructor_roster_exceptions enable row level security;

alter table public.scheduled_flights
  add column if not exists roster_override boolean not null default false;

-- Verify (read-only): both tables exist and are empty, the new column is there.
select 'instructor_roster' as t, count(*) from public.instructor_roster
union all select 'instructor_roster_exceptions', count(*) from public.instructor_roster_exceptions
union all select 'flights with roster_override', count(*) from public.scheduled_flights where roster_override;
