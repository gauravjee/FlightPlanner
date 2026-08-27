-- Aircraft Maintenance Schedule — engine_type column (2026-08-27)
--
-- User asked why the Model -> engine-category mapping used to filter the
-- Type/Model dropdown (added earlier today as lib/store.ts's
-- MODEL_ENGINE_TYPE) has to live hardcoded in code at all, given the
-- Aircraft Model list itself is already fully DB-driven (Admin Setup ->
-- Aircraft Maintenance Schedule's "Add Model" flow needs no code change or
-- deploy). Fair point, and consistent with this engagement's repeated
-- "replace a hardcoded list with a DB-backed one" pattern (exercise lists,
-- training-stage dropdowns, etc.) — moving it here so a newly-added model's
-- engine type is set the same way everything else about that model is: via
-- the Admin Setup UI, no code change required.
--
-- Denormalized onto EVERY row of aircraft_maintenance_schedule_templates
-- (same value repeated across all ~8 item-rows per model) rather than a
-- separate aircraft_models lookup table + foreign key — this table is
-- already the closest thing to a per-model registry this app has (its
-- aircraft_model column already doubles as the Model dropdown's source
-- list, per its own column comment), and introducing a real FK relationship
-- would mean also migrating aircraft.model off its current free-text/
-- loosely-coupled-by-string convention, a bigger change than this ask
-- needs. AircraftMaintenanceScheduleTab.tsx's UI keeps every row for a
-- given model in sync when Engine Type is changed there.
--
-- Nullable, and deliberately not backed by a NOT NULL constraint — a model
-- with no engine_type set on any of its rows should keep behaving exactly
-- like before this column existed: shown in the Model dropdown for BOTH
-- Types (unfiltered), same fallback as an unmapped model was under the old
-- hardcoded MODEL_ENGINE_TYPE approach. This means an admin CAN leave it
-- blank for a new custom model without breaking anything, at the cost of
-- that model not benefiting from the mismatch-prevention filter.

alter table aircraft_maintenance_schedule_templates
  add column if not exists engine_type text check (engine_type in ('Single Engine', 'Multi Engine') or engine_type is null);

comment on column aircraft_maintenance_schedule_templates.engine_type is
  'Which Aircraft Type (Single Engine / Multi Engine) this model belongs to — used to filter the Model dropdown in AircraftFormModal/AircraftSetupTab down to only models matching the selected Type. Same value expected across every row for a given aircraft_model (the AircraftMaintenanceScheduleTab UI keeps them in sync). NULL means "unknown/not set" — the model is then shown for either Type, same as before this column existed.';

-- Backfill the 9 models seeded so far (5 from the original migration +
-- 4 from today's fleet-expansion round) — matches the values that were in
-- lib/store.ts's now-removed MODEL_ENGINE_TYPE map.
update aircraft_maintenance_schedule_templates set engine_type = 'Single Engine' where aircraft_model = 'Cessna 172';
update aircraft_maintenance_schedule_templates set engine_type = 'Multi Engine'  where aircraft_model = 'Tecnam P2006T';
update aircraft_maintenance_schedule_templates set engine_type = 'Multi Engine'  where aircraft_model = 'Piper PA-34 Seneca';
update aircraft_maintenance_schedule_templates set engine_type = 'Multi Engine'  where aircraft_model = 'Diamond DA42 / DA42 NG';
update aircraft_maintenance_schedule_templates set engine_type = 'Multi Engine'  where aircraft_model = 'Piper PA-44 Seminole';
update aircraft_maintenance_schedule_templates set engine_type = 'Single Engine' where aircraft_model = 'Cessna 152';
update aircraft_maintenance_schedule_templates set engine_type = 'Single Engine' where aircraft_model = 'Piper PA-28 Cherokee / Archer';
update aircraft_maintenance_schedule_templates set engine_type = 'Single Engine' where aircraft_model = 'Piper Archer DX';
update aircraft_maintenance_schedule_templates set engine_type = 'Single Engine' where aircraft_model = 'Diamond DA40';
