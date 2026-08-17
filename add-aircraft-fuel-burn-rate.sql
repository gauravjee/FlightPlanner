-- add-aircraft-fuel-burn-rate.sql
-- ============================================================
-- Companion step for the "fuel burn rate calculator" patch
-- (fix-fuel-burn-rate-calculator.patch).
--
-- WHAT THIS SCRIPT DOES:
-- Adds one OPTIONAL column to `aircraft`:
--   fuel_burn_rate_lph  — numeric, this aircraft's own average cruise
--                         fuel burn in liters/hour, if the FTO has set
--                         one from the Aircraft form's new "Fuel Burn
--                         Rate (L/hr)" field.
--
-- Nullable, defaults to NULL. When NULL (the case for every existing
-- row until someone edits that aircraft and sets a value, or the form
-- auto-fills one on save), the app falls back to a built-in per-TYPE
-- average (FUEL_BURN_RATE_BY_TYPE_LPH in lib/store.ts — e.g. ~32 L/hr
-- for a C172S, ~20 L/hr for a C152), and finally to a flat 30 L/hr if
-- the type isn't in that table. Fully backward compatible — no backfill
-- needed for existing rows.
--
-- These per-type defaults are rough, commonly-cited averages for
-- planning/scheduling purposes only (used to estimate remaining fuel
-- and decide when a mandatory refuel buffer applies when booking a
-- flight) — they are NOT certified POH figures for any specific
-- airframe, and should never be used for actual inflight fuel
-- decisions. Every FTO should verify/adjust the rate for each of their
-- own aircraft via the Aircraft form once this column exists.
--
-- HOW TO RUN:
-- Open your Supabase project → SQL Editor → paste this whole file → Run.
-- Safe to re-run (IF NOT EXISTS guard makes it idempotent).
-- ============================================================

ALTER TABLE aircraft
  ADD COLUMN IF NOT EXISTS fuel_burn_rate_lph numeric;

COMMENT ON COLUMN aircraft.fuel_burn_rate_lph IS
  'This aircraft''s own average cruise fuel burn in liters/hour, if set. NULL = fall back to the built-in per-type default (see FUEL_BURN_RATE_BY_TYPE_LPH in lib/store.ts), then a flat 30 L/hr. Planning/scheduling estimate only, not a certified POH figure — verify per aircraft.';
