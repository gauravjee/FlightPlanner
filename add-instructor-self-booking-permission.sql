-- add-instructor-self-booking-permission.sql
-- ============================================================
-- Companion step for the role/tab permissions overhaul patch.
--
-- WHAT THIS SCRIPT DOES:
-- Adds one column to `instructors`:
--   can_self_book — boolean, whether THIS instructor is allowed to
--                   create their own new Schedule bookings. Defaults
--                   to false for every existing row: per the new
--                   permissions matrix, instructors can no longer
--                   self-book by default and a super_admin has to
--                   grant it per instructor (Instructors tab -> new
--                   "Can self-book" checkbox on each row).
--
-- Only gates CREATING a brand-new booking. It does not affect an
-- instructor's ability to view the Schedule, or to edit/debrief/cancel
-- flights already assigned to them — see components/schedule/
-- ScheduleBoard.tsx and BookingForm.tsx for where this is enforced,
-- and app/api/scheduled-flights/route.ts for the matching server-side
-- check.
--
-- Nullable-safe: NOT NULL with a DEFAULT so existing rows and any
-- insert that omits the column both land on the safe (false) side.
--
-- HOW TO RUN:
-- Open your Supabase project -> SQL Editor -> paste this whole file -> Run.
-- Safe to re-run (IF NOT EXISTS guard makes it idempotent).
-- ============================================================

ALTER TABLE instructors
  ADD COLUMN IF NOT EXISTS can_self_book boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN instructors.can_self_book IS
  'Whether this instructor can create their own new Schedule bookings. false by default — a super_admin grants it per instructor from the Instructors tab. Does not affect viewing the Schedule or editing/debriefing/cancelling flights already assigned to them.';
