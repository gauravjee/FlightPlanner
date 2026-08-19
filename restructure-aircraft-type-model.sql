-- restructure-aircraft-type-model.sql
-- ============================================================
-- WHY THIS EXISTS
-- The `aircraft` table's `type` column was actually being used to hold a
-- SPECIFIC MODEL CODE (e.g. 'C172S', 'PA44', 'DA42') — a hardcoded list
-- lived in both app/dashboard/admin/setup/AircraftSetupTab.tsx and
-- (a second, independently-drifted copy of) components/aircraft/
-- AircraftFormModal.tsx. Meanwhile `model` already existed as a separate
-- free-text column ("e.g., Cessna 172S Skyhawk") that was mostly
-- decorative. This meant the app had no real concept of "engine count" at
-- all — which became a blocker once CPL's Multi Engine Hours requirement
-- needed to auto-total from real flight records the same way Solo/
-- Cross-Country/Instrument/Night already do (by looking at which aircraft
-- a flight was flown in).
--
-- WHAT THIS SCRIPT DOES
-- 1. Freezes each existing aircraft's effective fuel burn rate (from the
--    OLD per-model-code default table) into its own fuel_burn_rate_lph
--    column, wherever that column is currently NULL — so no existing
--    aircraft's fuel-burn estimate silently changes once `type` stops
--    holding model codes. Only new aircraft (added after this migration)
--    get the new, coarser Single/Multi Engine category default.
-- 2. Adds `is_simulator boolean NOT NULL DEFAULT false` — lets an FTO
--    register their flight simulator as its own "aircraft" entry (e.g.
--    registration "SIM-1"), the same way ANY flight record already logs
--    against an aircraft_id. Any flight logged against an is_simulator=true
--    row will count toward a student's Simulator Hours automatically.
-- 3. Backfills `model` from the OLD `type` value wherever `model` is
--    currently blank — so the specific-model information isn't lost.
-- 4. Re-purposes `type` itself: becomes 'Single Engine' or 'Multi Engine'
--    (a genuinely fixed 2-value category, not a DB-staleness situation —
--    see this project's own Conventions on that distinction), based on
--    whether the OLD type code was one of the known multi-engine models
--    (PA44, DA42, BE76, BE58 — the four multi-engine codes that existed
--    across the two hardcoded lists in this app).
--
-- SAFE TO RE-RUN: step 1 only touches rows where fuel_burn_rate_lph IS
-- NULL (already-frozen rows are skipped); step 3 only touches blank
-- `model` values; step 4's CASE only matches the ORIGINAL model-code
-- values, so re-running after `type` has already become 'Single Engine'/
-- 'Multi Engine' just re-confirms the same category (no-op).
-- ============================================================

-- Step 1: freeze each aircraft's current effective fuel burn rate (from
-- the old per-model-code table) as an explicit override, ONLY for rows
-- that don't already have one set. Uses the exact same numbers that were
-- in FUEL_BURN_RATE_BY_TYPE_LPH (lib/store.ts) before this change.
UPDATE aircraft
SET fuel_burn_rate_lph = CASE UPPER(type)
  WHEN 'C172S' THEN 32
  WHEN 'C172R' THEN 32
  WHEN 'C152'  THEN 20
  WHEN 'C182'  THEN 38
  WHEN 'PA28'  THEN 32
  WHEN 'PA44'  THEN 40
  WHEN 'DA40'  THEN 28
  WHEN 'DA42'  THEN 28
  WHEN 'SR20'  THEN 36
  WHEN 'SR22'  THEN 47
  WHEN 'BE76'  THEN 42
  WHEN 'BE58'  THEN 68
  ELSE 30
END
WHERE fuel_burn_rate_lph IS NULL;

-- Step 2: add the simulator flag.
ALTER TABLE aircraft
  ADD COLUMN IF NOT EXISTS is_simulator boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN aircraft.is_simulator IS
  'True if this row represents a flight simulator/training device rather than a real aircraft. Any flight_records row logged against an is_simulator=true aircraft counts toward a student''s Simulator Hours on the Progress page.';

-- Step 3: backfill model from the old type value wherever model is blank,
-- so the specific-model information already recorded isn't lost.
UPDATE aircraft
SET model = type
WHERE model IS NULL OR TRIM(model) = '';

-- Step 4: re-purpose `type` into the engine-category value. Must run AFTER
-- step 1 (which still needed the old code in `type`) and can run in the
-- same statement as itself safely on re-run (see note above).
UPDATE aircraft
SET type = CASE
  WHEN UPPER(type) IN ('PA44', 'DA42', 'BE76', 'BE58') THEN 'Multi Engine'
  WHEN UPPER(type) IN ('SINGLE ENGINE', 'MULTI ENGINE') THEN INITCAP(type)
  ELSE 'Single Engine'
END;

COMMENT ON COLUMN aircraft.type IS
  'Engine category: ''Single Engine'' or ''Multi Engine''. Drives Multi Engine Hours classification on the Progress page and the fuel-burn-rate default. The SPECIFIC model/variant now lives in `model` (free text, e.g. "Cessna 172S Skyhawk") — `type` used to hold that instead, which is what this migration fixed.';
COMMENT ON COLUMN aircraft.model IS
  'Free-text specific model/variant, e.g. "Cessna 172S Skyhawk", "Piper Seneca II", "Diamond DA42 Twin Star". Display/identification only — not used in any lookup table.';

-- Verify
SELECT id, registration, type, model, is_simulator, fuel_burn_rate_lph
FROM aircraft
ORDER BY id;
