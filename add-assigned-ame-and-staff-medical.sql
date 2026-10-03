-- add-assigned-ame-and-staff-medical.sql (2026-10-03)
-- ADDITIVE ONLY: two new nullable columns. No existing data is changed or
-- removed. Safe to run more than once.
--
-- a. maintenance_records.assigned_ame_id: the AME doing the work on a task
--    (any status). Separate from ame_name / ame_license_no, which record who
--    CERTIFIED the release to service at completion. Shown in the
--    maintenance digest email. If an AME row is ever deleted, the task just
--    becomes unassigned.
alter table public.maintenance_records
  add column if not exists assigned_ame_id bigint references public.ames(id) on delete set null;

-- b. staff_members.medical_expiry: medical certificate expiry for any staff
--    member (edited on the Staff page). Expired or expiring within 30 days
--    goes into the licences & medicals digest email, and to the person.
alter table public.staff_members
  add column if not exists medical_expiry date;
