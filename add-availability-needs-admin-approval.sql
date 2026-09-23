-- add-availability-needs-admin-approval.sql
-- 2026-09-23. ADDITIVE ONLY — no approval-before-running needed under the
-- destructive-change rule: adds one new column with a default; no existing
-- value is changed or deleted (existing rows read false = unchanged rules).
--
-- WHY: operations can enter leave on an instructor's/student's behalf (e.g.
-- emergency leave). Those rows start PENDING with this flag set, and only
-- admin/super_admin may approve them — operations still approves people's
-- own requests.
--
-- REVERSIBLE: alter table public.availability drop column needs_admin_approval;
--
-- Safe to re-run: IF NOT EXISTS.

alter table public.availability
  add column if not exists needs_admin_approval boolean not null default false;

-- Verify (read-only): every existing row should show false.
select id, person_type, person_id, status, needs_admin_approval from public.availability order by id;
