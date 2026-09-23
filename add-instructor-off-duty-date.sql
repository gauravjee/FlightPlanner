-- add-instructor-off-duty-date.sql
-- 2026-09-23. ADDITIVE ONLY — no approval-before-running needed under the
-- destructive-change rule: adds one new nullable column; no existing value
-- is changed or deleted.
--
-- WHY: the one-day "Off duty today" override for the computed instructor
-- status (claude/instructor-status-plan-2026-09-23.md, option (b)). Staff
-- set it to today's date; the status reads Off duty only while the date
-- equals today, so it expires at midnight by itself — nothing to reset.
-- NULL = no override.
--
-- REVERSIBLE: alter table public.instructors drop column off_duty_date;
--
-- Safe to re-run: IF NOT EXISTS.

alter table public.instructors
  add column if not exists off_duty_date date;

-- Verify (read-only): the new column should show, empty.
select id, name, off_duty_date from public.instructors order by id;
