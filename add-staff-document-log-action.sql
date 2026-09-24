-- add-staff-document-log-action.sql
-- 2026-09-24. ADDITIVE ONLY — no approval-before-running needed under the
-- destructive-change rule: adds two new columns to staff_document_views.
-- The 2 existing rows get action = 'VIEW' through the new column's default
-- (backfilling a NEW column) and actor_role stays blank for them; no existing
-- value is changed or deleted.
--
-- WHY (operator 2026-09-24): the ID-document log must record changes as well
-- as views, with the user's id and role at the time:
--   VIEW = full ID documents opened      (GET /api/staff/[id])
--   ADD  = ID documents entered on a new staff record (POST /api/staff)
--   EDIT = ID documents changed or cleared           (PATCH /api/staff/[id])
-- viewed_by (existing) holds the user's id; actor_role holds their role.
--
-- REVERSIBLE:
--   alter table public.staff_document_views drop column action;
--   alter table public.staff_document_views drop column actor_role;
-- (would lose which rows were edits and the roles recorded since.)
--
-- Safe to re-run: IF NOT EXISTS.

alter table public.staff_document_views
  add column if not exists action text not null default 'VIEW'
  constraint staff_document_views_action_check check (action in ('VIEW', 'ADD', 'EDIT'));
alter table public.staff_document_views add column if not exists actor_role text;

-- Verify (read-only): the 2 test views, now marked VIEW.
select * from public.staff_document_views order by viewed_at desc;
