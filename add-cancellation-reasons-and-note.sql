-- add-cancellation-reasons-and-note.sql
-- 2026-09-23. Approved by the operator in chat before running.
--
-- WHAT: widens the allowed scheduled_flights.cancellation_reason values and
-- adds an optional free-text cancellation_note.
--
-- DATA IMPACT: none. No row is updated or deleted.
--   * The CHECK constraint is dropped and re-added with a SUPERSET of the old
--     values (WEATHER, MAINTENANCE, OTHER, REJECTED are all kept), so every
--     existing row still passes. Done inside one transaction, so the table is
--     never without the constraint.
--   * cancellation_note is a new nullable column (additive).
--
-- WHY: auto-cancel on approved leave (lib/leave.ts) writes 'ON_LEAVE', which
-- the old constraint rejected — so auto-cancel silently did nothing. The
-- other new codes are the common real-world causes at a training school;
-- cancellation_note carries the detail 'OTHER' alone never could.
--
-- REVERSIBLE: re-add the old 4-value constraint (only possible while no row
-- uses a new code) and `alter table ... drop column cancellation_note`.
--
-- Safe to re-run: the drop uses IF EXISTS and the column uses IF NOT EXISTS.

begin;

alter table public.scheduled_flights
  drop constraint if exists scheduled_flights_cancellation_reason_check;

alter table public.scheduled_flights
  add constraint scheduled_flights_cancellation_reason_check
  check (
    cancellation_reason is null
    or cancellation_reason = any (array[
      'WEATHER',
      'MAINTENANCE',
      'ON_LEAVE',
      'REJECTED',
      'STUDENT_NO_SHOW',
      'INSTRUCTOR_UNAVAILABLE',
      'ATC_AIRSPACE',
      'OTHER'
    ])
  );

alter table public.scheduled_flights
  add column if not exists cancellation_note text;

commit;

-- Verify (read-only): should list all 8 codes and show the new column.
select pg_get_constraintdef(oid)
  from pg_constraint
 where conname = 'scheduled_flights_cancellation_reason_check';

select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'scheduled_flights' and column_name = 'cancellation_note';
