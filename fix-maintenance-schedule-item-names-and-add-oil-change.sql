-- Aircraft Maintenance Schedule — follow-up fix (2026-08-26, same day as
-- add-aircraft-maintenance-schedule.sql). Run AFTER that migration.
--
-- Two problems found once the feature was in use:
--
-- 1. computeMaintenanceDueItems() (lib/store.ts) ties a completed
--    maintenance_records row back to a template item by matching
--    maintenance_type/description against the template's item_name. The
--    original seed used lowercase phrasing ("100-hour inspection",
--    "Annual inspection", "Engine overhaul (TBO)") that does NOT exactly
--    match the Maintenance page's existing "Log Maintenance" form, whose
--    Type dropdown (a fixed, hardcoded list — see MaintenanceForm.tsx) has
--    always offered "100-Hour Inspection", "Annual Inspection", and
--    "Engine Overhaul". A staff member logging routine maintenance through
--    that normal, already-familiar screen would silently NOT reset the
--    due-tracking clock, because the two names never matched. (The
--    matching function was also made case/whitespace-insensitive in the
--    same 2026-08-26 round as defense in depth, but the names are aligned
--    here too so the common path just works without relying on that.)
--
-- 2. The original seed only covered Engine Overhaul (TBO), Annual
--    Inspection, and 100-Hour Inspection — it never covered Oil Change or
--    50-Hour Inspection, both of which are ALSO already options in that
--    same "Log Maintenance" dropdown and are real recurring items (oil
--    changes in particular are far more frequent than the 100-hour/annual
--    items already tracked). Adding them here.
--
-- Oil change intervals researched 2026-08-26 (see handoff doc for full
-- citations): Lycoming Service Bulletin No. 480 — 50 hrs (full-flow
-- filtration, standard on modern trainer installations) or 4 months,
-- whichever comes first; Continental follows the same convention.
-- Rotax 912 series — 100 hrs on mogas, 50 hrs if run on 100LL avgas more
-- than 30% of the time (this FTO's actual fuel mix should be confirmed
-- before trusting the 100-hr figure below). Austro AE300 (Diamond DA42
-- NG) — 100 hrs, per the oil+filter kit interval already noted in the
-- original research table.
--
-- "50-Hour Inspection" itself (as distinct from the oil change) is NOT a
-- manufacturer- or DGCA-mandated interval the way 100-hour/annual are —
-- it's a common operator-elected practice (often combined with the oil
-- change). Seeded at 50 hrs to match what the dropdown already offers and
-- what staff may already be logging under that name; confirm against this
-- FTO's own approved maintenance programme.

-- --- 1. Rename existing rows to match MaintenanceForm.tsx's dropdown exactly ---
update aircraft_maintenance_schedule_templates set item_name = '100-Hour Inspection' where item_name = '100-hour inspection';
update aircraft_maintenance_schedule_templates set item_name = 'Annual Inspection' where item_name = 'Annual inspection';
update aircraft_maintenance_schedule_templates set item_name = 'Engine Overhaul' where item_name = 'Engine overhaul (TBO)';

-- --- 2. Add Oil Change + 50-Hour Inspection per model ---
insert into aircraft_maintenance_schedule_templates (aircraft_model, item_name, interval_type, interval_value, notes)
values
  ('Cessna 172', 'Oil Change', 'HOBBS_HOURS', 50, 'Lycoming Service Bulletin No. 480 — 50 hrs (full-flow filtration) or 4 months, whichever first; the 4-month calendar cap is not separately tracked here (hobbs-only item in Phase 1).'),
  ('Cessna 172', '50-Hour Inspection', 'HOBBS_HOURS', 50, 'Operator-elected practice, not a Lycoming/DGCA-mandated interval — often combined with the oil change above. Confirm against this FTO''s approved maintenance programme.'),

  ('Tecnam P2006T', 'Oil Change', 'HOBBS_HOURS', 100, 'Rotax 912 series — 100 hrs on mogas; reduces to 50 hrs if run on 100LL avgas more than 30% of the time (SI-912-016-R4). Confirm this FTO''s actual fuel mix before trusting the 100-hr figure.'),
  ('Tecnam P2006T', '50-Hour Inspection', 'HOBBS_HOURS', 50, 'Operator-elected practice, not a Rotax/DGCA-mandated interval. Confirm against this FTO''s approved maintenance programme.'),

  ('Piper PA-34 Seneca', 'Oil Change', 'HOBBS_HOURS', 50, 'Continental TSIO-360 series — same 50-hr/4-month convention as Lycoming (SIL98-9E family); the 4-month calendar cap is not separately tracked here (hobbs-only item in Phase 1).'),
  ('Piper PA-34 Seneca', '50-Hour Inspection', 'HOBBS_HOURS', 50, 'Operator-elected practice, not a Continental/DGCA-mandated interval. Confirm against this FTO''s approved maintenance programme.'),

  -- No "50-Hour Inspection" row for the Diamond DA42/DA42 NG below — the
  -- Austro AE300's own schedule bundles at 100/300/600 hrs (see the
  -- original research table), not the Lycoming/Continental-style 50/100-hr
  -- convention the other four models follow. Add one here if this FTO's
  -- approved programme calls for it anyway.
  ('Diamond DA42 / DA42 NG', 'Oil Change', 'HOBBS_HOURS', 100, 'Austro AE300 — 100-hr oil + filter kit interval (matches the original research table); earlier Thielert/Continental CD-135/155-engined DA42 variants may differ.'),

  ('Piper PA-44 Seminole', 'Oil Change', 'HOBBS_HOURS', 50, 'Lycoming O-360 series — same 50-hr/4-month convention as the Cessna 172; the 4-month calendar cap is not separately tracked here (hobbs-only item in Phase 1).'),
  ('Piper PA-44 Seminole', '50-Hour Inspection', 'HOBBS_HOURS', 50, 'Operator-elected practice, not a Lycoming/DGCA-mandated interval. Confirm against this FTO''s approved maintenance programme.')
on conflict do nothing;
