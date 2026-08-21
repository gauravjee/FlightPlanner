-- add-license-issue-dates.sql (2026-08-20, second round)
-- Adds issue-date columns alongside the license-number/expiry-date fields
-- from add-ba-test-and-license-numbers.sql and add-license-expiry-
-- dates.sql (both already run) — a student's SPL Number and an
-- instructor's CPL/License Number each also get a companion issue date,
-- same pairing as the expiry date. Both nullable: not every existing
-- record will have this filled in immediately, same as spl_number/
-- spl_expiry_date themselves.
--
-- Separate migration file rather than editing either prior file in place,
-- since both have already been run — same reasoning as
-- add-license-expiry-dates.sql's own header. This one is scoped to just
-- the two new columns.

alter table students add column if not exists spl_issue_date date;
comment on column students.spl_issue_date is 'Issue date of the student''s Student Pilot License (SPL). Nullable — not every student has one filled in yet.';

alter table instructors add column if not exists license_issue_date date;
comment on column instructors.license_issue_date is 'Issue date of the instructor''s CPL (Commercial Pilot License) / License Number.';
