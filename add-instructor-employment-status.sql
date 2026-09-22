-- add-instructor-employment-status.sql
-- 2026-09-23. ADDITIVE ONLY — no approval-before-running needed under the
-- destructive-change rule: adds one new column and nothing else. Existing
-- rows get 'ACTIVE' through the column default (backfilling a NEW column);
-- no existing value is changed or deleted.
--
-- WHY: instructors.status was being used for two different things — the
-- real-time operational state (Available / Flying / Off duty) and whether
-- someone still works here. This separates the second one out:
--   ACTIVE   = current instructor (shown, bookable, assignable to students)
--   INACTIVE = left / retired (hidden by default, not bookable)
-- Login access is deliberately NOT tied to this — that stays on
-- users.is_active, so a departed instructor's records can still be pulled.
--
-- REVERSIBLE: alter table public.instructors drop column employment_status;
-- (would lose any INACTIVE markings made since.)
--
-- Safe to re-run: IF NOT EXISTS.

alter table public.instructors
  add column if not exists employment_status text not null default 'ACTIVE'
  constraint instructors_employment_status_check
  check (employment_status in ('ACTIVE', 'INACTIVE'));

-- Verify (read-only): every instructor should show ACTIVE.
select id, name, employment_status from public.instructors order by id;
