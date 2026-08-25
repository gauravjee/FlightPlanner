-- Adds students.medical_issue_date — the DGCA Class 1 medical certificate's
-- issue date, paired with the existing medical_expiry column.
--
-- Separate migration from earlier ones (same reasoning as
-- add-license-issue-dates.sql's own header): editing an already-run
-- migration file and asking the user to "run it again" is confusing even
-- though `ADD COLUMN IF NOT EXISTS` is safe to re-run.
--
-- 2026-08-25: this powers a new "auto until touched" calculation in
-- StudentFormModal.tsx — entering Medical Issue Date auto-fills Medical
-- Expiry using the DGCA Class 1 rule: 12 months from issue if the student
-- was under 40 on the issue date, 6 months if 40 or older, minus 1 day
-- (the validity period is inclusive of the issue date, same convention as
-- SPL/CPL expiry — see add-license-issue-dates.sql). Medical Expiry stays
-- directly editable after auto-fill, same pattern as every other
-- auto-fill field in this app.
alter table students add column if not exists medical_issue_date date;
comment on column students.medical_issue_date is 'Issue date of the student''s DGCA Class 1 medical certificate. Nullable — not every student has one filled in yet.';
