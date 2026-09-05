-- add-dgca-maintenance-log-fields.sql (2026-09-05)
-- Item 42, DGCA Maintenance Log half.
--
-- Adds the four certification/record fields the DGCA maintenance log needs
-- that `maintenance_records` did not already carry, matching the column set
-- in docs/dgca-templates/FlightPro_Maintenance_Log_Template_DRAFT.docx:
--
--   Date                          -> completed_date (existing)
--   Airframe Total Hrs            -> hobbs_at_completion (EXISTING — see below)
--   Defect / Snag Reported        -> description (existing)
--   Rectification Action Taken    -> notes (existing)
--   Parts / Materials Used        -> parts_used            (NEW)
--   AME Name & License No.        -> ame_name, ame_license_no (NEW)
--   CRS Ref. / Signature          -> crs_reference         (NEW)
--
-- ⚠️ NO airframe_total_hours COLUMN, deliberately. The template's own note
-- asked whether airframe hours should be pulled from the app's existing
-- Hobbs tracking rather than hand-entered; the answer (user, 2026-09-05) is
-- yes. `hobbs_at_completion` already exists, already anchors the
-- maintenance-schedule due calculations, and is prefilled from the
-- aircraft's current hobbsTime in the form. A second hours column would be
-- a second source of truth that can silently disagree with the first.
--
-- ⚠️ NO crs_date COLUMN either. The template has one date per log row and
-- one in the CRS summary block; `completed_date` serves both. Add a
-- separate certification date only if a real CRS is ever signed on a
-- different day from the work being completed — which would be a paperwork
-- problem worth surfacing, not a schema gap.
--
-- All four are plain nullable text: every existing row predates this and
-- stays valid, and a maintenance record that is still SCHEDULED or
-- IN_PROGRESS legitimately has no certification yet. Nothing here is
-- required at the DB level — the CRS block only becomes meaningful on a
-- COMPLETED record, which the form enforces by only showing it then.
--
-- Free text rather than a foreign key to `users` for ame_name: the AME who
-- signs a release to service is frequently an external/contract engineer
-- with no login to this app, so a FK would force a fake user row for every
-- outside signature. The licence number is the identifying field a DGCA
-- auditor actually checks, and it is recorded verbatim.

alter table maintenance_records add column if not exists parts_used text;
alter table maintenance_records add column if not exists ame_name text;
alter table maintenance_records add column if not exists ame_license_no text;
alter table maintenance_records add column if not exists crs_reference text;

comment on column maintenance_records.parts_used is 'DGCA maintenance log: parts/materials consumed on this job, free text. Set via the Log Maintenance form when status = COMPLETED.';
comment on column maintenance_records.ame_name is 'DGCA maintenance log: name of the AME certifying the release to service. Free text — external/contract AMEs have no user row.';
comment on column maintenance_records.ame_license_no is 'DGCA maintenance log: certifying AME licence number and category. The identifying field on a DGCA audit.';
comment on column maintenance_records.crs_reference is 'DGCA maintenance log: Certificate of Release to Service reference number. The app RECORDS the CRS; it does not issue one — the signature stays on paper.';

-- ---------------------------------------------------------------------------
-- is_baseline — added the same day, after the new report made the problem
-- visible. RE-RUN THIS FILE if you already applied the four columns above;
-- every statement here is idempotent.
--
-- ⚠️ WHY THIS EXISTS. "Set Baseline" in the Maintenance Due panel writes a
-- COMPLETED maintenance_records row purely to anchor an item's due clock
-- when schedule tracking is switched on for an aircraft. NO WORK WAS
-- CARRIED OUT and no AME certified anything. Until now, the only thing
-- distinguishing such a row from real maintenance was its generated
-- description text, "Baseline entry for <item> (schedule tracking enabled)".
--
-- That was harmless while these rows only fed due-date arithmetic. It stops
-- being harmless the moment they appear in a DGCA maintenance log, where
-- every row reads as work performed and certified. On the test data this
-- was eight synthetic rows out of eleven.
--
-- Hence a real column rather than a LIKE against the description at read
-- time: a compliance filter must not depend on UI copy that any future
-- edit would silently break.
alter table maintenance_records add column if not exists is_baseline boolean not null default false;

-- One-time backfill of rows created before the column existed. Matching on
-- the description is safe HERE, and only here, because that string was
-- app-generated from a fixed template (MaintenanceDueSection.tsx) and was
-- never user-typed. This is a migration of historical rows, not the
-- ongoing detection mechanism.
update maintenance_records
   set is_baseline = true
 where is_baseline = false
   and description like 'Baseline entry for %(schedule tracking enabled)';

comment on column maintenance_records.is_baseline is 'True for a synthetic "Set Baseline" row that anchors maintenance-schedule due dates without any work having been performed. Excluded from the DGCA Maintenance Log report — see app/dashboard/reports/maintenance-log/page.tsx.';
