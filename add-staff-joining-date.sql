-- add-staff-joining-date.sql
-- 2026-09-24. ADDITIVE ONLY — no approval-before-running needed under the
-- destructive-change rule: adds two new nullable columns and nothing else.
-- No existing value is changed or deleted.
--
-- WHY (operator request 2026-09-24): a joining date for all staff except
-- super admin, and for students.
--   instructors.joining_date — Instructors page form; the Duty Roster report
--     shows days before it as "Not joined" and leaves out anyone who joins
--     after the report period.
--   users.joining_date — Admin Setup > User Management (add + edit), for
--     admin / operations / instructor / maintenance / safety officer logins.
--     Not used by any report yet.
-- Students already have students.joined_date; it is now editable on the
-- Students form (no schema change needed).
--
-- REVERSIBLE:
--   alter table public.instructors drop column joining_date;
--   alter table public.users drop column joining_date;
-- (would lose any joining dates entered since.)
--
-- Safe to re-run: IF NOT EXISTS.

alter table public.instructors add column if not exists joining_date date;
alter table public.users add column if not exists joining_date date;

-- Verify (read-only): both columns exist and are blank.
select id, name, joining_date from public.instructors order by id;
select id, name, role, joining_date from public.users order by name;
