-- Aircraft Maintenance Schedule — second follow-up (2026-08-26, same day
-- as the other two migrations). Run AFTER
-- fix-maintenance-schedule-item-names-and-add-oil-change.sql.
--
-- User asked whether every item in the "Log Maintenance" screen's Type
-- dropdown (MaintenanceForm.tsx — a fixed, hardcoded list) was covered by
-- the new schedule table. Of the 10 options, 5 were already covered by
-- the two earlier migrations (Oil Change, 50-Hour Inspection, 100-Hour
-- Inspection, Annual Inspection, Engine Overhaul); AD Compliance,
-- Emergency / AOG, and Other are deliberately NOT recurring-interval
-- items (ADs are issued ad hoc against specific defects, AOG is
-- inherently unscheduled, Other is free text) and stay untracked.
--
-- That left Avionics Check and Propeller Service as genuine candidates —
-- both CAN have a real recurring interval, just not one that was in the
-- original research pass. User asked to add both.
--
-- Avionics Check — 24 calendar months, all 5 models. This is the
-- standard pitot-static/altimeter/transponder recurring recertification
-- convention (FAA 14 CFR 91.411/91.413 use 24 months; most other
-- regulators, DGCA included, follow a similar cycle) — SAME caveat as
-- everywhere else in this table: confirm the exact cycle against this
-- FTO's DGCA-approved maintenance programme before trusting this as
-- authoritative. Item name "Avionics Check" matches the dropdown exactly.
--
-- Propeller Service — HOBBS_HOURS, per-model, because propeller TBO is
-- driven by the PROPELLER's make/model, not the airframe or engine, and
-- varies far more than engine TBO does between fixed-pitch and
-- constant-speed installations:
--   - Fixed-pitch (McCauley, typical on the Cessna 172): 2,000 hrs / 72
--     calendar months per McCauley's published TBO table (fixed-pitch
--     propellers use a single standardized figure, unlike their
--     constant-speed line).
--   - Constant-speed (Hartzell/McCauley, typical on the Seneca/Seminole):
--     2,000 hrs / 72 months used here as a representative figure, but
--     McCauley's own table shows constant-speed models ranging 1,200-
--     6,000 hrs / 60-72 months depending on the EXACT model/hub — this is
--     the loosest figure in this whole table and most needs confirming
--     against the actual propeller data plate.
--   - Composite/MT-Propeller (typical on the Tecnam P2006T and Diamond
--     DA42/DA42 NG): 2,000 hrs / 144 months (12 years), the long-standing
--     MT-Propeller convention for their composite-blade models (some
--     specific models have since had TBO extended further via service
--     bulletin — confirm against the actual installed model).

insert into aircraft_maintenance_schedule_templates (aircraft_model, item_name, interval_type, interval_value, notes)
values
  ('Cessna 172', 'Avionics Check', 'CALENDAR_MONTHS', 24, 'Pitot-static/altimeter/transponder recurring recertification convention (FAA 91.411/91.413-style 24-month cycle) — confirm exact cycle against this FTO''s DGCA-approved maintenance programme.'),
  ('Cessna 172', 'Propeller Service', 'HOBBS_HOURS', 2000, 'McCauley fixed-pitch propeller TBO — 2,000 hrs or 72 calendar months, whichever first (McCauley TBO table); the 72-month calendar cap is not separately tracked here (hobbs-only item in Phase 1). Confirm against the actual propeller model/serial.'),

  ('Tecnam P2006T', 'Avionics Check', 'CALENDAR_MONTHS', 24, 'Pitot-static/altimeter/transponder recurring recertification convention (FAA 91.411/91.413-style 24-month cycle) — confirm exact cycle against this FTO''s DGCA-approved maintenance programme.'),
  ('Tecnam P2006T', 'Propeller Service', 'HOBBS_HOURS', 2000, 'MT-Propeller composite-blade TBO convention — 2,000 hrs / 12 years (some specific models extended further via service bulletin). Confirm against the actual propeller model installed.'),

  ('Piper PA-34 Seneca', 'Avionics Check', 'CALENDAR_MONTHS', 24, 'Pitot-static/altimeter/transponder recurring recertification convention (FAA 91.411/91.413-style 24-month cycle) — confirm exact cycle against this FTO''s DGCA-approved maintenance programme.'),
  ('Piper PA-34 Seneca', 'Propeller Service', 'HOBBS_HOURS', 2000, 'Hartzell/McCauley constant-speed propeller — 2,000 hrs used as a representative figure, but McCauley''s own table shows constant-speed models ranging 1,200-6,000 hrs / 60-72 months depending on exact model/hub. This is the LEAST certain figure in this table — confirm against the actual propeller data plate before trusting it.'),

  ('Diamond DA42 / DA42 NG', 'Avionics Check', 'CALENDAR_MONTHS', 24, 'Pitot-static/altimeter/transponder recurring recertification convention (FAA 91.411/91.413-style 24-month cycle) — confirm exact cycle against this FTO''s DGCA-approved maintenance programme.'),
  ('Diamond DA42 / DA42 NG', 'Propeller Service', 'HOBBS_HOURS', 2000, 'MT-Propeller composite-blade TBO convention — 2,000 hrs / 12 years (some specific models extended further via service bulletin). Confirm against the actual propeller model installed.'),

  ('Piper PA-44 Seminole', 'Avionics Check', 'CALENDAR_MONTHS', 24, 'Pitot-static/altimeter/transponder recurring recertification convention (FAA 91.411/91.413-style 24-month cycle) — confirm exact cycle against this FTO''s DGCA-approved maintenance programme.'),
  ('Piper PA-44 Seminole', 'Propeller Service', 'HOBBS_HOURS', 2000, 'Hartzell/McCauley constant-speed propeller — 2,000 hrs used as a representative figure, but McCauley''s own table shows constant-speed models ranging 1,200-6,000 hrs / 60-72 months depending on exact model/hub. Confirm against the actual propeller data plate before trusting it.')
on conflict do nothing;
