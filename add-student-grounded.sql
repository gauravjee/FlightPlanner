-- add-student-grounded.sql (2026-10-14) — B4 Grounded status (operator, 14 Oct: a temporary suspension with an end date).
-- No stored data changes: one new nullable column, and the status check is replaced by a wider one
-- (every existing row is ACTIVE, so it passes). Reversible: drop the column and restore the 4-value check.
alter table public.students add column grounded_until date;
alter table public.students drop constraint students_status_check;
alter table public.students add constraint students_status_check check (status in ('ACTIVE','GROUNDED','SUSPENDED','GRADUATED','LEFT'));
alter table public.students add constraint students_grounded_until_check check ((status = 'GROUNDED') = (grounded_until is not null));
