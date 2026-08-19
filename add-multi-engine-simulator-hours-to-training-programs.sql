-- add-multi-engine-simulator-hours-to-training-programs.sql
-- ============================================================
-- WHY THIS EXISTS
-- The user caught a real gap in CPL's hour segregation: the syllabus also
-- mandates Multi Engine Hours and Simulator Hours minimums, which were
-- never added alongside the five requirement columns from
-- add-training-program-requirement-columns.sql (Solo/Cross-Country/
-- Instrument/Night/Landings). While fixing this, the user also gave the
-- REAL correct CPL numbers, which differ from that earlier migration's
-- backfill guesses (Solo was seeded as 100, actually 90; Cross-Country was
-- seeded as 50, actually 60).
--
-- NOTE: add-training-program-requirement-columns.sql was listed as "not
-- yet confirmed run in Supabase" as of the last handoff note — this script
-- is written to be self-contained and safe either way: it (re-)adds all
-- seven requirement columns with IF NOT EXISTS, then sets CPL's complete,
-- correct set of numbers regardless of whether the earlier migration ran.
--
-- UNLIKE the five existing requirement columns, multi_engine_hours and
-- simulator_hours are intentionally left NULL for every OTHER program
-- (PPL, IR, MULTI, etc.) — these aren't concepts that apply broadly to
-- every training stage the way Solo/Cross-Country/Instrument/Night do, so
-- there's no PPL-style built-in fallback for them on the Progress page.
-- When NULL, the Progress page simply doesn't show that metric's card for
-- a student on that program, rather than silently applying a CPL number to
-- a PPL student. See app/dashboard/progress/page.tsx.
--
-- SAFE TO RE-RUN: IF NOT EXISTS guards on the columns; the CPL UPDATE
-- always sets the same seven numbers.
-- ============================================================

ALTER TABLE training_programs
  ADD COLUMN IF NOT EXISTS solo_hours numeric,
  ADD COLUMN IF NOT EXISTS cross_country_hours numeric,
  ADD COLUMN IF NOT EXISTS instrument_hours numeric,
  ADD COLUMN IF NOT EXISTS night_hours numeric,
  ADD COLUMN IF NOT EXISTS landings_required integer,
  ADD COLUMN IF NOT EXISTS multi_engine_hours numeric,
  ADD COLUMN IF NOT EXISTS simulator_hours numeric;

COMMENT ON COLUMN training_programs.multi_engine_hours IS
  'Minimum Multi Engine hours required for this program. NULL = this metric does not apply to this program and its card is hidden on the Progress page (no built-in fallback, unlike solo/cross-country/instrument/night). Actual hours auto-total from flight_records logged against an aircraft with type = ''Multi Engine''.';
COMMENT ON COLUMN training_programs.simulator_hours IS
  'Minimum Simulator hours required for this program. NULL = this metric does not apply to this program and its card is hidden on the Progress page. Actual hours auto-total from flight_records logged against an aircraft with is_simulator = true.';

-- Correct CPL's full, real requirement set (replaces the earlier
-- migration's seeded guesses for solo/cross-country; instrument/night were
-- already correct; multi-engine/simulator are new).
UPDATE training_programs
SET
  solo_hours = 90,
  cross_country_hours = 60,
  instrument_hours = 10,
  night_hours = 5,
  multi_engine_hours = 15,
  simulator_hours = 20
WHERE program_code = 'CPL';

-- Verify
SELECT program_code, program_name, required_hours, solo_hours,
       cross_country_hours, instrument_hours, night_hours,
       landings_required, multi_engine_hours, simulator_hours
FROM training_programs
ORDER BY program_code;
