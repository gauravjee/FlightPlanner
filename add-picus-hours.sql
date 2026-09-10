-- add-picus-hours.sql (2026-09-10)
-- PIC / PICUS hours on the digital logbook.
--
-- WHY. The Progress page's "Solo Hours" metric summed every flight_record
-- with flight_type = 'SOLO'. That is solo time, which is NOT the same thing
-- as pilot-in-command time: a student flying a DUAL sortie can act as the
-- commander with an instructor aboard, and that time counts toward the PIC
-- requirement for a CPL. DGCA calls it PICUS — Pilot in Command Under
-- Supervision. The app had no way to record it at all, so any student
-- building PIC time on dual sorties was undercounted.
--
-- MODEL (user decision, 2026-09-10):
--   PIC total = all SOLO flight hours (automatic — on a solo sortie the
--               student IS the commander for the whole flight)
--             + picus_hours entered by the instructor on DUAL sorties
--
-- Hence ONE nullable column, set only on dual sorties. A solo flight's PIC
-- time is its total_hours and is never stored twice — deriving it keeps the
-- two from disagreeing if a flight's duration is later corrected.
--
-- ⚠️ NULL vs 0 matters and they are not the same:
--   NULL = the instructor did not mark this dual flight as student-PIC
--   0    = marked, but no PIC time was actually flown (unusual, but legal
--          to record, and it must not be silently rewritten to NULL)
-- Nothing here has a default for that reason: every pre-existing row stays
-- NULL, which is correct — no historical dual flight was ever assessed for
-- PICUS, and inventing 0 would assert something nobody checked.
--
-- Not enforced at the DB level: picus_hours <= total_hours. total_hours is
-- itself sometimes derived rather than stored (see calcHours in
-- lib/hooks/useFlightRecords.ts), so a CHECK constraint would compare
-- against a column that can legitimately be NULL. The forms clamp the input
-- to the flight's computed duration instead.

alter table flight_records add column if not exists picus_hours numeric;

comment on column flight_records.picus_hours is
  'DGCA PICUS: hours the STUDENT acted as Pilot in Command Under Supervision on a DUAL sortie. NULL = not marked as student-PIC (the default for every historical row); 0 = marked but no PIC time flown. Solo sorties do NOT use this column — their PIC time is the whole flight and is derived from total_hours. Summed with solo hours into the Progress page PIC metric.';
