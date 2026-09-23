-- add-instructor-last-working-date.sql
-- 2026-09-24. ADDITIVE ONLY — no approval-before-running needed under the
-- destructive-change rule: adds one new nullable column and nothing else.
-- No existing value is changed or deleted.
--
-- WHY: the Duty Roster report should show an Inactive (left/retired)
-- instructor only for periods that include days up to their last working
-- day (operator rule 2026-09-24). Set in the Edit Instructor form when
-- Employment is switched to Inactive; cleared when switched back to Active.
-- An Inactive instructor with no date recorded is not shown on the report.
--
-- REVERSIBLE: alter table public.instructors drop column last_working_date;
-- (would lose any last working days entered since.)
--
-- Safe to re-run: IF NOT EXISTS.

alter table public.instructors
  add column if not exists last_working_date date;

-- Verify (read-only): Inactive instructors will show a blank last_working_date
-- until someone edits them and picks the date.
select id, name, employment_status, last_working_date from public.instructors order by id;
