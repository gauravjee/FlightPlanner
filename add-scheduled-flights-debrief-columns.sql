-- add-scheduled-flights-debrief-columns.sql (2026-09-19)
-- logbook_pending / pending_debrief on scheduled_flights.
--
-- WHY. DebriefForm.tsx's Check-Out/Debrief flow (both the "auto-create
-- logbook entry" path and the "logbook pending" path — see its
-- handleSubmit) always sends `logbookPending` and `pendingDebrief` in its
-- PATCH to /api/scheduled-flights/[id]. That route's FIELD_MAP has always
-- mapped these to scheduled_flights.logbook_pending / .pending_debrief,
-- but neither column existed in the actual database. Every flight
-- checkout — both modes, every role, every aircraft — failed after the
-- logbook entry (flight_records row) was already created: the status
-- update 500'd, so the flight never flipped to COMPLETED and was stuck at
-- IN_PROGRESS with no UI path back (Check-Out only shows for IN_PROGRESS
-- flights). Found and confirmed during the 2026-09-19 full E2E test pass
-- while live-testing P0-3's Hobbs guard — see claude/handoff-2026-09-19.md.
--
-- pending_debrief is a JSONB snapshot of the debrief inputs (flightDate,
-- departureTime, arrivalTime, hobbsStart, hobbsEnd, landings, maneuvers,
-- instructorNotes, studentPerformance, weatherConditions) captured when
-- "auto-create logbook entry" is left unchecked, so the flight still
-- counts as flown (status COMPLETED) but shows up as a "Logbook Pending"
-- item to finish later from the Flights page instead of the debrief data
-- just disappearing.
--
-- ADDITIVE ONLY: adds two nullable/defaulted columns, touches no existing
-- data. No approval-before-running needed under the project's
-- destructive-change rule, but flagged here per that rule's own "say so
-- when handing it over" requirement. Already run directly in the Supabase
-- SQL editor on 2026-09-19 — this file just captures it as a reproducible
-- migration.

alter table public.scheduled_flights add column if not exists logbook_pending boolean default false;
alter table public.scheduled_flights add column if not exists pending_debrief jsonb;

comment on column public.scheduled_flights.logbook_pending is
  'True when this flight was checked out with "auto-create logbook entry" unchecked: the flight is COMPLETED but its logbook entry still needs to be finished from the Flights page using pending_debrief below.';
comment on column public.scheduled_flights.pending_debrief is
  'JSONB snapshot of the debrief inputs captured at check-out when logbook_pending is true. NULL once the logbook entry is finished, or when the logbook entry was auto-created at check-out.';
