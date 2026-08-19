-- add-reports-module.sql
-- ============================================================
-- Companion step for the new Reports section (fix-reports-daily-flying.patch)
-- — first report built: the Daily Flying Report. See that patch's summary
-- for the full design writeup.
--
-- WHAT THIS SCRIPT DOES:
--
-- 1) Adds `cancellation_reason` to `scheduled_flights`.
--    Needed because cancelling a flight used to be a hard DELETE — no
--    trace was kept of a cancellation at all, let alone why. The Daily
--    Flying Report needs to count Weather vs. Maintenance vs. Other
--    cancellations per day, which requires the row to survive. The patch
--    changes cancelFlight() (lib/store.ts) from a DELETE to an UPDATE
--    that sets status='CANCELLED' + this reason — bringing the actual
--    cancel action in line with the CANCELLED-status handling that
--    already existed everywhere else in the app (dashboard widgets,
--    conflict checks, MaintenanceForm), which a hard-delete had made
--    unreachable dead code up to now.
--    NULL = no reason recorded (legacy behavior / cancelled before this
--    patch, or a future cancellation where no reason was given).
--
-- 2) Creates `safety_incidents` — a minimal incident log. Not the full
--    DGCA-format Incident Report (that's a separate, not-yet-scoped
--    report) — just enough to log that something happened, on what date,
--    involving which aircraft/people, so the Daily Flying Report's
--    "Safety incidents" count has real data instead of a hand-typed
--    number. Designed to be extended into the full report later without
--    a breaking schema change.
--
-- 3) Creates `daily_flying_reports` — one saved snapshot per calendar
--    date. Per the "save it once generated" decision: generating a day's
--    report computes every row and every footer stat from live data at
--    that moment and freezes it here (plus the free-text remarks entered
--    at generation time), so re-opening a past date later shows exactly
--    what was submitted rather than a live recalculation that could
--    drift if underlying flight records are edited afterward.
--    `rows`/`stats` are JSONB — this data is a point-in-time report
--    artifact, not something the rest of the app ever queries
--    relationally, so a flexible blob is a better fit than a rigid table.
--    Regenerating a date's report overwrites its existing snapshot
--    (report_date is UNIQUE) — intentional, so a mistake can be
--    corrected before final sign-off; it is not meant to be silently
--    re-run behind someone's back once a day is considered final.
--
-- Every ID column below (aircraft_id, student_id, instructor_id,
-- reported_by) is plain text, deliberately NOT a foreign key — this
-- project's other tables don't use DB-level FK constraints either (IDs
-- are treated as opaque strings resolved at the application layer), so
-- this keeps the same convention rather than introducing a new one that
-- could mismatch the real column types.
--
-- HOW TO RUN:
-- Open your Supabase project → SQL Editor → paste this whole file → Run.
-- Safe to re-run (IF NOT EXISTS / DROP-then-ADD-CONSTRAINT guards make it
-- idempotent).
--
-- NOTE ON RLS:
-- New Supabase tables auto-enable Row Level Security, which blocks the
-- anon-key path this app uses unless disabled — same gotcha as every
-- other new table in this project. Proactively disabled below.
-- ============================================================

-- 1) Cancellation reason -------------------------------------------------

ALTER TABLE scheduled_flights
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

ALTER TABLE scheduled_flights
  DROP CONSTRAINT IF EXISTS scheduled_flights_cancellation_reason_check;

ALTER TABLE scheduled_flights
  ADD CONSTRAINT scheduled_flights_cancellation_reason_check
  CHECK (cancellation_reason IS NULL OR cancellation_reason IN ('WEATHER', 'MAINTENANCE', 'OTHER'));

COMMENT ON COLUMN scheduled_flights.cancellation_reason IS
  'Why this booking was cancelled — WEATHER, MAINTENANCE, or OTHER. NULL for flights that are not cancelled, or were cancelled before this column existed. Set by cancelFlight() in lib/store.ts, which now soft-cancels (UPDATE status=CANCELLED) instead of deleting the row.';

-- 2) Safety incidents (minimal log) --------------------------------------

create table if not exists safety_incidents (
  id bigint generated always as identity primary key,
  incident_date date not null,
  incident_time text,
  aircraft_id text,
  aircraft_reg text,
  student_id text,
  student_name text,
  instructor_id text,
  instructor_name text,
  description text not null,
  severity text not null default 'MINOR' check (severity in ('MINOR', 'MAJOR', 'CRITICAL')),
  reported_by text,
  created_at timestamptz not null default now()
);

comment on table safety_incidents is
  'Minimal safety incident log — date, who/what was involved, a description, and a severity. Feeds the Daily Flying Report''s "Safety incidents" count. Not the full DGCA-format Incident Report (a separate, larger report, not yet built) — this is deliberately lightweight, extendable later without a breaking change.';

create index if not exists idx_safety_incidents_date on safety_incidents (incident_date);

alter table safety_incidents disable row level security;

-- 3) Daily Flying Report snapshots ---------------------------------------

create table if not exists daily_flying_reports (
  id bigint generated always as identity primary key,
  report_date date not null unique,
  airport_code text,
  rows jsonb not null default '[]'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  remarks text not null default '',
  generated_by text,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table daily_flying_reports is
  'One saved snapshot per calendar date (report_date is UNIQUE) — the flight rows, computed footer stats, and free-text remarks as they stood when the report was generated. Re-generating a date overwrites its snapshot (deliberate — lets a mistake be corrected before sign-off). Not recalculated live on every view, so a past day''s report cannot silently drift if the underlying flight records are edited later.';

create index if not exists idx_daily_flying_reports_date on daily_flying_reports (report_date);

alter table daily_flying_reports disable row level security;
