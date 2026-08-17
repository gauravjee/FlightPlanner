-- add-training-program-requirement-columns.sql
-- ============================================================
-- Companion step for the "Progress page uses configured training
-- programs" bug fix (Bug 3 of the known-issues round — see
-- app/dashboard/progress/page.tsx and
-- app/dashboard/admin/setup/TrainingProgramsTab.tsx).
--
-- WHAT THIS SCRIPT DOES:
-- Adds five OPTIONAL numeric columns to `training_programs`, alongside
-- the pre-existing `required_hours`:
--   solo_hours            — minimum solo hours required
--   cross_country_hours   — minimum cross-country hours required
--   instrument_hours      — minimum instrument hours required
--   night_hours           — minimum night hours required
--   landings_required     — minimum landings required
--
-- All five are nullable and default to NULL. Previously the Progress
-- page's six per-metric targets (Total/Solo/Cross-Country/Instrument/
-- Night hours + Landings) were hardcoded PPL_REQUIREMENTS/
-- CPL_REQUIREMENTS constants in that page's own source, with no DB
-- representation at all — meaning an FTO could not customize these
-- numbers, and the Progress page could silently disagree with whatever
-- was actually configured on the Requirements tab. These columns make
-- each metric configurable per training program from Admin Setup ->
-- Training Programs -> "Progress tracking minimums".
--
-- When a column is NULL — either because no training_programs row
-- matches the student's training stage, or because a matched row hasn't
-- set that specific field — the Progress page falls back to its
-- built-in PPL/CPL default for that one metric only (per-field
-- fallback, not all-or-nothing). Fully backward compatible: existing
-- rows keep working exactly as before until an admin fills these in.
--
-- The backfill below seeds sensible starting values for the two stages
-- the old hardcoded constants covered (PPL, CPL), matching those exact
-- numbers, so behavior is unchanged immediately after running this
-- script. It only touches rows whose program_code is exactly 'PPL' or
-- 'CPL' AND that don't already have these columns set (won't overwrite
-- any values an admin has already configured). IR/MULTI and any other
-- program codes are intentionally left NULL — there was no prior
-- hardcoded source of truth for those, so they keep using PPL's
-- built-in fallback (the same behavior as before this fix) until an
-- admin sets real numbers for them.
--
-- HOW TO RUN:
-- Open your Supabase project -> SQL Editor -> paste this whole file -> Run.
-- Safe to re-run (IF NOT EXISTS guards + backfill only touches NULLs).
-- ============================================================

ALTER TABLE training_programs
  ADD COLUMN IF NOT EXISTS solo_hours numeric,
  ADD COLUMN IF NOT EXISTS cross_country_hours numeric,
  ADD COLUMN IF NOT EXISTS instrument_hours numeric,
  ADD COLUMN IF NOT EXISTS night_hours numeric,
  ADD COLUMN IF NOT EXISTS landings_required integer;

COMMENT ON COLUMN training_programs.solo_hours IS
  'Minimum solo hours required for this program. NULL = fall back to the built-in PPL/CPL default on the Progress page (see PPL_REQUIREMENTS/CPL_REQUIREMENTS in app/dashboard/progress/page.tsx).';
COMMENT ON COLUMN training_programs.cross_country_hours IS
  'Minimum cross-country hours required for this program. NULL = fall back to the built-in PPL/CPL default on the Progress page.';
COMMENT ON COLUMN training_programs.instrument_hours IS
  'Minimum instrument hours required for this program. NULL = fall back to the built-in PPL/CPL default on the Progress page.';
COMMENT ON COLUMN training_programs.night_hours IS
  'Minimum night hours required for this program. NULL = fall back to the built-in PPL/CPL default on the Progress page.';
COMMENT ON COLUMN training_programs.landings_required IS
  'Minimum landings required for this program. NULL = fall back to the built-in PPL/CPL default on the Progress page.';

-- Backfill: seed PPL/CPL rows with the same numbers the old hardcoded
-- constants used, so nothing changes behaviorally until an admin edits
-- them. Only fills currently-NULL columns on exact 'PPL'/'CPL' program
-- codes — will not overwrite any values already configured.
UPDATE training_programs
SET
  solo_hours = COALESCE(solo_hours, 10),
  cross_country_hours = COALESCE(cross_country_hours, 5),
  instrument_hours = COALESCE(instrument_hours, 3),
  night_hours = COALESCE(night_hours, 3),
  landings_required = COALESCE(landings_required, 20)
WHERE program_code = 'PPL';

UPDATE training_programs
SET
  solo_hours = COALESCE(solo_hours, 100),
  cross_country_hours = COALESCE(cross_country_hours, 50),
  instrument_hours = COALESCE(instrument_hours, 10),
  night_hours = COALESCE(night_hours, 5),
  landings_required = COALESCE(landings_required, 50)
WHERE program_code = 'CPL';

-- IR/MULTI and any other program_code: left NULL intentionally (no
-- prior hardcoded source of truth). Set real numbers per program from
-- Admin Setup -> Training Programs whenever ready.
