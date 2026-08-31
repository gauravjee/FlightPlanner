-- add-squawk-reporting.sql (2026-08-31)
-- Lets a pilot (instructor or student, per explicit user decision) file a
-- maintenance defect ("squawk") directly against `maintenance_records`
-- through a restricted-field POST, instead of only staff being able to log
-- one. See app/api/maintenance-records/route.ts and
-- claude/flightlogger-competitive-comparison-2026-08-31.md, gap #2.
--
-- reported_by: who filed the squawk (denormalized name/email at entry
-- time, same convention as safety_incidents.reported_by). Null for
-- ordinary staff-logged maintenance records.
-- is_squawk: true for a pilot-filed report, so the UI can badge/filter
-- them separately from routine staff-logged maintenance.
alter table maintenance_records add column if not exists reported_by text;
alter table maintenance_records add column if not exists is_squawk boolean not null default false;

comment on column maintenance_records.is_squawk is 'True when this record was filed by a pilot (instructor/student) via the "Report a Defect" page, not logged by maintenance staff.';
