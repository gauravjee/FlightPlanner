-- add-ames-table.sql
-- Certifying engineers (AME) roster, so MaintenanceForm.tsx and
-- MaintenanceDueSection.tsx's completion flows can select from a
-- maintained list instead of retyping name + licence number every time a
-- maintenance record is certified (2026-09-18, P0 #4).
--
-- ADDITIVE ONLY: creates one new table, touches no existing data. No
-- approval-before-running needed under the project's destructive-change
-- rule, but flagged here per that rule's own "say so when handing it over"
-- requirement.

create table public.ames (
  id bigint generated always as identity primary key,
  name text not null,
  license_no text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- RLS on, no policy — the same "service-role only" configuration every
-- other table in this app got during the 2026-09-18 RLS remediation (see
-- claude/data-access-security-mapping.md). All access goes through
-- app/api/admin/config/[table]/route.ts via supabaseAdmin; the anon key
-- never touches this table directly.
alter table public.ames enable row level security;
