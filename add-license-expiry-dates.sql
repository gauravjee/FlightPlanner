-- add-license-expiry-dates.sql (2026-08-20)
-- Adds expiry-date columns alongside the license-number fields added in
-- add-ba-test-and-license-numbers.sql (already run) — a student's SPL
-- Number and an instructor's CPL/License Number each get a companion
-- expiry date. Both nullable: not every existing record will have this
-- filled in immediately, same as spl_number itself.
--
-- Separate migration file rather than editing add-ba-test-and-license-
-- numbers.sql in place, since that one has already been run — appending
-- to an already-applied file and asking the user to "run it again" is
-- confusing, even though the ADD COLUMN IF NOT EXISTS pattern is safe to
-- re-run. This one is scoped to just the two new columns.

alter table students add column if not exists spl_expiry_date date;
comment on column students.spl_expiry_date is 'Expiry date of the student''s Student Pilot License (SPL). Nullable — not every student has one filled in yet.';

alter table instructors add column if not exists license_expiry_date date;
comment on column instructors.license_expiry_date is 'Expiry date of the instructor''s CPL (Commercial Pilot License) / License Number.';
