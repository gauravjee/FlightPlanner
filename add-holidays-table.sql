-- add-holidays-table.sql
-- ============================================================
-- Companion step for the "Holiday Calendar" + "Weekly Off Day" patch
-- (fix-exercise-csv-holiday-calendar-weekly-off.patch).
--
-- WHAT THIS SCRIPT DOES:
-- Creates a new `holidays` table — FTO-wide blackout dates. Flight
-- bookings and ground-school classes cannot be scheduled on a date that
-- matches a row here (see findHolidayForDate/getSchedulingBlockReason in
-- lib/store.ts, enforced in BookingForm, ScheduleBoard, and
-- GroundSchoolCalendar).
--
-- Columns:
--   id            — primary key
--   holiday_name  — e.g. "Republic Day"
--   holiday_date  — 'YYYY-MM-DD'. For a recurring holiday, only the
--                   month/day are matched (the year is just where it was
--                   first entered) — see is_recurring below.
--   is_recurring  — true for an annual holiday (e.g. a national holiday)
--                   that should automatically block the same calendar
--                   date every future year without being re-added; false
--                   for a one-time/per-year holiday that only blocks that
--                   exact date.
--   notes         — optional free text
--   created_at    — insert timestamp
--
-- The companion "Weekly Off Day(s)" feature (a recurring day-of-week
-- closure, e.g. every Sunday) does NOT need a new table — it reuses the
-- existing `fto_settings` key-value table via a new `weekly_off_days`
-- setting key (comma-separated day-of-week numbers, 0=Sunday..6=Saturday),
-- managed from Admin Setup -> FTO Settings -> Time & Scheduling. No SQL
-- needed for that part; fto_settings already accepts new keys.
--
-- HOW TO RUN:
-- Open your Supabase project → SQL Editor → paste this whole file → Run.
-- Safe to re-run (IF NOT EXISTS guards make it idempotent).
--
-- NOTE ON RLS:
-- New Supabase tables auto-enable Row Level Security, which blocks the
-- anon-key read/write path this app uses unless a policy is added or RLS
-- is disabled. This project's other tables all have RLS disabled (see the
-- same gotcha previously hit with `general_weather_cache`), so this script
-- proactively disables it here too, to avoid a repeat round-trip.
-- ============================================================

create table if not exists holidays (
  id bigint generated always as identity primary key,
  holiday_name text not null,
  holiday_date date not null,
  is_recurring boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

comment on table holidays is
  'FTO-wide blackout dates. Flight bookings and ground-school classes cannot be scheduled on a date matching a row here. is_recurring=true matches by month/day every year; is_recurring=false matches the exact holiday_date only.';

-- Every scheduling check filters/orders by holiday_date; explicit index for clarity.
create index if not exists idx_holidays_date on holidays (holiday_date);

alter table holidays disable row level security;
