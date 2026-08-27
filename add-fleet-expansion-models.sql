-- Aircraft Maintenance Schedule — fleet expansion (2026-08-27)
--
-- User asked to add 4 more aircraft models to the Model dropdown / schedule
-- table: Cessna 152, Piper PA-28 Cherokee / Archer, Piper Archer DX,
-- Diamond DA40 — on top of the original 5 (Cessna 172, Tecnam P2006T,
-- Piper PA-34 Seneca, Diamond DA42 / DA42 NG, Piper PA-44 Seminole).
--
-- All 4 new models are SINGLE ENGINE — lib/store.ts's MODEL_ENGINE_TYPE map
-- has been updated accordingly so the Type-filtered Model dropdown (added
-- 2026-08-27) offers them only when "Single Engine" is selected.
--
-- Same 8-item-per-model shape as the original 5 (Engine Overhaul, Annual
-- Inspection, 100-Hour Inspection, Oil Change, 50-Hour Inspection, Avionics
-- Check, Propeller Service, AD Compliance) EXCEPT Piper Archer DX, which
-- (like the diesel-engined Diamond DA42/DA42 NG before it) does NOT get a
-- separate 50-Hour Inspection row — its diesel engine doesn't follow the
-- Lycoming/Continental-avgas 50/100-hr convention the other models do.
--
-- Researched 2026-08-27 via web search, real sources cited per row below —
-- same discipline as the original 5 models' seed data and the later
-- Propeller Service / Avionics Check / AD Compliance rounds. Two of these
-- four figures carry MORE uncertainty than the original table and are
-- flagged explicitly:
--   - Piper PA-28 Cherokee / Archer is a single row covering a whole
--     model FAMILY (Cherokee 140/160/180, Archer II/III) that spans at
--     least two different Lycoming engine displacements (O-320 and O-360)
--     across variants — the figure below is for the O-360-powered Archer,
--     the most common trainer-fleet configuration; confirm against the
--     SPECIFIC airframe's actual engine before trusting this for an older
--     Cherokee 140/160.
--   - Piper Archer DX runs a Continental/Technify CD-155 diesel — its
--     recurring "overhaul" figure is actually a TBR (Time Between
--     Replacement: the whole engine is replaced, not overhauled/rebuilt),
--     a genuinely different maintenance concept from every other engine in
--     this table. Seeded under the same "Engine Overhaul" item name so it
--     still surfaces on the Maintenance Due panel and matches the
--     "Log Maintenance" dropdown's existing option, but the notes column
--     flags the TBR-not-TBO distinction explicitly.

insert into aircraft_maintenance_schedule_templates (aircraft_model, item_name, interval_type, interval_value, notes)
values
  -- ---------------- Cessna 152 (Lycoming O-235) ----------------
  ('Cessna 152', 'Engine Overhaul', 'HOBBS_HOURS', 2000, 'Lycoming O-235 series TBO, typically 2000 hrs / 12 years for most variants — some later variants (e.g. O-235-L2C/N2C) are rated to 2400 hrs by Lycoming. Confirm against this aircraft''s specific engine model/serial before relying on the higher figure.'),
  ('Cessna 152', 'Annual Inspection', 'CALENDAR_MONTHS', 12, 'Conventional annual inspection cadence — confirm against operator''s approved CAMP.'),
  ('Cessna 152', '100-Hour Inspection', 'HOBBS_HOURS', 100, 'Conventional 100-hour inspection cadence for training/rental use — confirm against operator''s approved CAMP; this is an FAA Part 91.409 convention, not a DGCA-mandated figure.'),
  ('Cessna 152', 'Oil Change', 'HOBBS_HOURS', 50, 'Lycoming Service Bulletin No. 480 — 50 hrs (full-flow filtration) or 4 months, whichever first; the 4-month calendar cap is not separately tracked here (hobbs-only item in Phase 1).'),
  ('Cessna 152', '50-Hour Inspection', 'HOBBS_HOURS', 50, 'Operator-elected practice, not a Lycoming/DGCA-mandated interval — often combined with the oil change above. Confirm against this FTO''s approved maintenance programme.'),
  ('Cessna 152', 'Avionics Check', 'CALENDAR_MONTHS', 24, 'Pitot-static/altimeter/transponder recurring recertification convention (FAA 91.411/91.413-style 24-month cycle) — confirm exact cycle against this FTO''s DGCA-approved maintenance programme.'),
  ('Cessna 152', 'Propeller Service', 'HOBBS_HOURS', 2000, 'McCauley fixed-pitch propeller TBO — 2,000 hrs or 72 calendar months, whichever first (McCauley TBO table, same convention as the Cessna 172); the 72-month calendar cap is not separately tracked here (hobbs-only item in Phase 1). Confirm against the actual propeller model/serial.'),
  ('Cessna 152', 'AD Compliance', 'CALENDAR_MONTHS', 12, 'Represents the annual Airworthiness Review Certificate (ARC) renewal cycle (12-month max validity, DGCA Airworthiness Procedures Manual), the recurring checkpoint where AD/Mandatory Modification compliance status is reviewed per DGCA''s Advisory Circular. NOT a blanket "recheck ADs every 12 months" DGCA rule — individual ADs are each one-time-compliance items with their own applicability; use this row as a reminder to reconfirm overall AD/mod status ahead of ARC renewal, not as the AD tracking system itself.'),

  -- ---------- Piper PA-28 Cherokee / Archer (Lycoming O-360, Archer-spec) ----------
  ('Piper PA-28 Cherokee / Archer', 'Engine Overhaul', 'HOBBS_HOURS', 2000, 'Lycoming O-360 series TBO, typically 2000 hrs / 12 years — figure is for the O-360-powered Archer (PA-28-181), the most common trainer-fleet configuration for this model family. An older Cherokee 140/160 in this same fleet slot may run a smaller-displacement O-320 with a different TBO — confirm against the SPECIFIC aircraft''s engine model/serial before trusting this figure for anything but an Archer.'),
  ('Piper PA-28 Cherokee / Archer', 'Annual Inspection', 'CALENDAR_MONTHS', 12, 'Conventional annual inspection cadence — confirm against operator''s approved CAMP.'),
  ('Piper PA-28 Cherokee / Archer', '100-Hour Inspection', 'HOBBS_HOURS', 100, 'Conventional 100-hour inspection cadence for training/rental use — confirm against operator''s approved CAMP; this is an FAA Part 91.409 convention, not a DGCA-mandated figure.'),
  ('Piper PA-28 Cherokee / Archer', 'Oil Change', 'HOBBS_HOURS', 50, 'Lycoming Service Bulletin No. 480 — 50 hrs (full-flow filtration) or 4 months, whichever first; the 4-month calendar cap is not separately tracked here (hobbs-only item in Phase 1).'),
  ('Piper PA-28 Cherokee / Archer', '50-Hour Inspection', 'HOBBS_HOURS', 50, 'Operator-elected practice, not a Lycoming/DGCA-mandated interval — often combined with the oil change above. Confirm against this FTO''s approved maintenance programme.'),
  ('Piper PA-28 Cherokee / Archer', 'Avionics Check', 'CALENDAR_MONTHS', 24, 'Pitot-static/altimeter/transponder recurring recertification convention (FAA 91.411/91.413-style 24-month cycle) — confirm exact cycle against this FTO''s DGCA-approved maintenance programme.'),
  ('Piper PA-28 Cherokee / Archer', 'Propeller Service', 'HOBBS_HOURS', 2000, 'Sensenich/McCauley fixed-pitch propeller, typical on the Archer — 2,000 hrs / 72 calendar months used as a representative figure, same convention as the Cessna 172/152; the 72-month calendar cap is not separately tracked here (hobbs-only item in Phase 1). Confirm against the actual propeller model/serial — this row is not authoritative for a constant-speed variant.'),
  ('Piper PA-28 Cherokee / Archer', 'AD Compliance', 'CALENDAR_MONTHS', 12, 'Represents the annual Airworthiness Review Certificate (ARC) renewal cycle (12-month max validity, DGCA Airworthiness Procedures Manual), the recurring checkpoint where AD/Mandatory Modification compliance status is reviewed per DGCA''s Advisory Circular. NOT a blanket "recheck ADs every 12 months" DGCA rule — individual ADs are each one-time-compliance items with their own applicability; use this row as a reminder to reconfirm overall AD/mod status ahead of ARC renewal, not as the AD tracking system itself.'),

  -- ---------------- Piper Archer DX (Continental/Technify CD-155 diesel) ----------------
  -- No 50-Hour Inspection row — see header note, same reasoning as the
  -- diesel-engined Diamond DA42/DA42 NG.
  ('Piper Archer DX', 'Engine Overhaul', 'HOBBS_HOURS', 2100, 'Continental/Technify CD-155 diesel — this is a TBR (Time Between Replacement: the whole engine is replaced, not overhauled), increased to 2,100 hrs by Continental in 2016 (widely reported at the time, incl. Piper''s own press release). Genuinely different maintenance concept from a traditional TBO — flagged so this isn''t mistaken for an overhaul-and-reuse figure like every other engine in this table.'),
  ('Piper Archer DX', 'Annual Inspection', 'CALENDAR_MONTHS', 12, 'Conventional annual inspection cadence — confirm against operator''s approved CAMP.'),
  ('Piper Archer DX', '100-Hour Inspection', 'HOBBS_HOURS', 100, 'Conventional 100-hour inspection cadence for training/rental use — confirm against operator''s approved CAMP; this is an FAA Part 91.409 convention, not a DGCA-mandated figure.'),
  ('Piper Archer DX', 'Oil Change', 'HOBBS_HOURS', 100, 'Diesel (Jet-A) installations typically run a longer oil-change interval than avgas piston engines — 100 hrs used here as a representative figure, matching the same convention already used for the Austro AE300 (Diamond DA42 NG) in this table. NOT independently confirmed for the CD-155 specifically — verify against this engine''s actual approved maintenance manual before relying on it.'),
  ('Piper Archer DX', 'Avionics Check', 'CALENDAR_MONTHS', 24, 'Pitot-static/altimeter/transponder recurring recertification convention (FAA 91.411/91.413-style 24-month cycle) — confirm exact cycle against this FTO''s DGCA-approved maintenance programme.'),
  ('Piper Archer DX', 'Propeller Service', 'HOBBS_HOURS', 2000, 'MT-Propeller composite-blade convention (Piper''s diesel Archer variants are commonly paired with an MT 3-blade composite prop) — 2,000 hrs / 144 months (12 years), same convention as the Tecnam P2006T/Diamond DA42. NOT independently confirmed for this specific installation — confirm against the actual propeller model/serial.'),
  ('Piper Archer DX', 'AD Compliance', 'CALENDAR_MONTHS', 12, 'Represents the annual Airworthiness Review Certificate (ARC) renewal cycle (12-month max validity, DGCA Airworthiness Procedures Manual), the recurring checkpoint where AD/Mandatory Modification compliance status is reviewed per DGCA''s Advisory Circular. NOT a blanket "recheck ADs every 12 months" DGCA rule — individual ADs are each one-time-compliance items with their own applicability; use this row as a reminder to reconfirm overall AD/mod status ahead of ARC renewal, not as the AD tracking system itself.'),

  -- ---------------- Diamond DA40 (classic, Lycoming IO-360-M1A) ----------------
  ('Diamond DA40', 'Engine Overhaul', 'HOBBS_HOURS', 2000, 'Lycoming IO-360-M1A TBO, 2000 hrs / 12 years — the standard Lycoming figure for this engine family, same as the O-360 used elsewhere in this fleet. This row is for the classic Lycoming-powered DA40 — NOT the diesel/Austro-engined DA42 NG, which is a separate row.'),
  ('Diamond DA40', 'Annual Inspection', 'CALENDAR_MONTHS', 12, 'Conventional annual inspection cadence — confirm against operator''s approved CAMP.'),
  ('Diamond DA40', '100-Hour Inspection', 'HOBBS_HOURS', 100, 'Conventional 100-hour inspection cadence for training/rental use — confirm against operator''s approved CAMP; this is an FAA Part 91.409 convention, not a DGCA-mandated figure.'),
  ('Diamond DA40', 'Oil Change', 'HOBBS_HOURS', 50, 'Lycoming Service Bulletin No. 480 — 50 hrs (full-flow filtration) or 4 months, whichever first; the 4-month calendar cap is not separately tracked here (hobbs-only item in Phase 1).'),
  ('Diamond DA40', '50-Hour Inspection', 'HOBBS_HOURS', 50, 'Operator-elected practice, not a Lycoming/DGCA-mandated interval — often combined with the oil change above. Confirm against this FTO''s approved maintenance programme.'),
  ('Diamond DA40', 'Avionics Check', 'CALENDAR_MONTHS', 24, 'Pitot-static/altimeter/transponder recurring recertification convention (FAA 91.411/91.413-style 24-month cycle) — confirm exact cycle against this FTO''s DGCA-approved maintenance programme.'),
  ('Diamond DA40', 'Propeller Service', 'HOBBS_HOURS', 2000, 'Constant-speed propeller (typically Hartzell or a composite equivalent on this airframe) — 2,000 hrs / 72 calendar months used as a representative figure, same convention as the Seneca/Seminole. This is the LEAST certain figure in this migration — the exact propeller make/model varies by installation and was not independently confirmed; check the actual propeller data plate before trusting it.'),
  ('Diamond DA40', 'AD Compliance', 'CALENDAR_MONTHS', 12, 'Represents the annual Airworthiness Review Certificate (ARC) renewal cycle (12-month max validity, DGCA Airworthiness Procedures Manual), the recurring checkpoint where AD/Mandatory Modification compliance status is reviewed per DGCA''s Advisory Circular. NOT a blanket "recheck ADs every 12 months" DGCA rule — individual ADs are each one-time-compliance items with their own applicability; use this row as a reminder to reconfirm overall AD/mod status ahead of ARC renewal, not as the AD tracking system itself.')
on conflict do nothing;
