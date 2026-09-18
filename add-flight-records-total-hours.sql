-- add-flight-records-total-hours.sql (2026-09-18)
-- Records the flight's stored duration in hours on flight_records.
--
-- WHY. P0 #1 (commit d8de101, 2026-09-18) added `total_hours` to the
-- flight-record INSERT payload (app/api/flight-records/route.ts), fixing a
-- bug where a flight crossing midnight computed a negative duration. That
-- fix assumed the column already existed — it didn't. Every flight-record
-- insert since P0 #1 shipped was silently failing with a 500 until this
-- migration was run (found and confirmed during the 2026-09-19 full E2E
-- test pass — see claude/handoff-2026-09-19.md).
--
-- Nullable, no default, no backfill: every reader already falls back to
-- computing duration from departure/arrival time when this is null, so
-- historical rows are unaffected and don't need a value.
--
-- ADDITIVE ONLY: adds one nullable column, touches no existing data. No
-- approval-before-running needed under the project's destructive-change
-- rule, but flagged here per that rule's own "say so when handing it over"
-- requirement. Already run directly in the Supabase SQL editor on
-- 2026-09-18/19 — this file just captures it as a reproducible migration.

alter table public.flight_records add column if not exists total_hours numeric;

comment on column public.flight_records.total_hours is
  'Flight duration in hours, computed client-side at debrief time. NULL on older rows and on any insert path that predates this column — readers fall back to computing duration from departure_time/arrival_time when null.';
