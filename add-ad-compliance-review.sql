-- Aircraft Maintenance Schedule — third follow-up (2026-08-26, same day
-- as the other three migrations). Run AFTER
-- add-propeller-service-and-avionics-check.sql.
--
-- User asked to research whether DGCA has anything that would let
-- "AD Compliance" (the last untracked item in MaintenanceForm.tsx's Type
-- dropdown) be added to the schedule table.
--
-- Researched 2026-08-26 (see handoff doc for full sourcing) — this item
-- is DIFFERENT IN KIND from every other row in this table, and that
-- matters for how to read it:
--
--   - Airworthiness Directives and DGCA Mandatory Modifications are each
--     issued individually against a specific type/serial/component
--     defect. DGCA's own Advisory Circular on Mandatory Modification
--     compliance describes a ONE-TIME submission per modification (via
--     the eGCA portal), not a recurring interval — "The form is meant for
--     one time submission by each operator for every Mandatory
--     Modification issued by DGCA." Any REPEAT inspection an individual
--     AD calls for (e.g. "inspect for cracks every 100 hours") is
--     specific to that one AD and is not something that can be generically
--     seeded here — there is no single number that covers "AD
--     compliance" the way there is for engine TBO or an oil change.
--
--   - What DOES recur, and is genuinely DGCA-specific: compliance status
--     against outstanding ADs/Mandatory Modifications is checked "at the
--     time of issuance of Certificate of Airworthiness (C of A) /
--     Airworthiness Review Certificate (ARC); and routine spot checks,
--     surveillance checks, and audits" (same Advisory Circular). The ARC
--     itself has a maximum validity of 12 months per DGCA's Airworthiness
--     Procedures Manual, and must be renewed annually for the aircraft to
--     remain legally airworthy.
--
-- So the row added below is seeded as a 12-month recurring item — but it
-- represents "review/reconfirm AD & Mandatory Modification compliance
-- status, coinciding with the annual ARC renewal," an administrative/
-- paperwork checkpoint, NOT a physical maintenance task with its own
-- fixed interval the way every other row in this table is. This is
-- flagged explicitly in the notes column so it isn't mistaken for a
-- DGCA-mandated "check ADs every 12 months" rule, which does not exist as
-- a blanket figure — confirm this FTO's actual ARC renewal cadence before
-- relying on this row.
--
-- Applies uniformly to all 5 models — the ARC cycle is a
-- registration/operator-level requirement, not aircraft-type-specific.

insert into aircraft_maintenance_schedule_templates (aircraft_model, item_name, interval_type, interval_value, notes)
values
  ('Cessna 172', 'AD Compliance', 'CALENDAR_MONTHS', 12, 'Represents the annual Airworthiness Review Certificate (ARC) renewal cycle (12-month max validity, DGCA Airworthiness Procedures Manual), the recurring checkpoint where AD/Mandatory Modification compliance status is reviewed per DGCA''s Advisory Circular. NOT a blanket "recheck ADs every 12 months" DGCA rule — individual ADs are each one-time-compliance items with their own applicability; use this row as a reminder to reconfirm overall AD/mod status ahead of ARC renewal, not as the AD tracking system itself.'),
  ('Tecnam P2006T', 'AD Compliance', 'CALENDAR_MONTHS', 12, 'Represents the annual Airworthiness Review Certificate (ARC) renewal cycle (12-month max validity, DGCA Airworthiness Procedures Manual), the recurring checkpoint where AD/Mandatory Modification compliance status is reviewed per DGCA''s Advisory Circular. NOT a blanket "recheck ADs every 12 months" DGCA rule — individual ADs are each one-time-compliance items with their own applicability; use this row as a reminder to reconfirm overall AD/mod status ahead of ARC renewal, not as the AD tracking system itself.'),
  ('Piper PA-34 Seneca', 'AD Compliance', 'CALENDAR_MONTHS', 12, 'Represents the annual Airworthiness Review Certificate (ARC) renewal cycle (12-month max validity, DGCA Airworthiness Procedures Manual), the recurring checkpoint where AD/Mandatory Modification compliance status is reviewed per DGCA''s Advisory Circular. NOT a blanket "recheck ADs every 12 months" DGCA rule — individual ADs are each one-time-compliance items with their own applicability; use this row as a reminder to reconfirm overall AD/mod status ahead of ARC renewal, not as the AD tracking system itself.'),
  ('Diamond DA42 / DA42 NG', 'AD Compliance', 'CALENDAR_MONTHS', 12, 'Represents the annual Airworthiness Review Certificate (ARC) renewal cycle (12-month max validity, DGCA Airworthiness Procedures Manual), the recurring checkpoint where AD/Mandatory Modification compliance status is reviewed per DGCA''s Advisory Circular. NOT a blanket "recheck ADs every 12 months" DGCA rule — individual ADs are each one-time-compliance items with their own applicability; use this row as a reminder to reconfirm overall AD/mod status ahead of ARC renewal, not as the AD tracking system itself.'),
  ('Piper PA-44 Seminole', 'AD Compliance', 'CALENDAR_MONTHS', 12, 'Represents the annual Airworthiness Review Certificate (ARC) renewal cycle (12-month max validity, DGCA Airworthiness Procedures Manual), the recurring checkpoint where AD/Mandatory Modification compliance status is reviewed per DGCA''s Advisory Circular. NOT a blanket "recheck ADs every 12 months" DGCA rule — individual ADs are each one-time-compliance items with their own applicability; use this row as a reminder to reconfirm overall AD/mod status ahead of ARC renewal, not as the AD tracking system itself.')
on conflict do nothing;
