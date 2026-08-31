-- add-safety-incident-numbering-and-maintenance-routing.sql (2026-08-31)
-- Extends the safety incident workflow (add-safety-incident-workflow.sql)
-- per explicit user decision: (1) year-scoped auto-generated incident
-- numbers (INC-2026-001, resets each year), (2) a structured category at
-- report time, with technical categories auto-suggesting Maintenance as
-- assignee, (3) a narrow Maintenance resolution action (resolution note +
-- RESOLVED status only — see lib/permissions.ts INCIDENT_RESOLVE_ROLES),
-- and (4) final close performed by the original reporter or an existing
-- INCIDENT_MANAGE_ROLES user — see app/api/safety-incidents/[id]/route.ts.
--
-- incident_number is generated in the app layer (app/api/safety-incidents/
-- route.ts), not a DB trigger/sequence, matching this table's existing
-- convention of denormalized-but-app-owned columns (risk_score). The
-- unique index below is the safety net: a same-year race between two
-- concurrent reports would collide on insert and the route retries once.
alter table safety_incidents add column if not exists incident_number text;
alter table safety_incidents add column if not exists category text not null default 'OTHER'
  check (category in ('BIRD_STRIKE', 'MECHANICAL_SYSTEMS', 'OTHER_TECHNICAL', 'OPERATIONAL', 'OTHER'));
alter table safety_incidents add column if not exists resolution_note text;
alter table safety_incidents add column if not exists resolved_by text;
alter table safety_incidents add column if not exists resolved_at timestamptz;

create unique index if not exists idx_safety_incidents_incident_number on safety_incidents (incident_number) where incident_number is not null;

-- RESOLVED sits between IN_PROGRESS and CLOSED: Maintenance moves a
-- technical incident here via their narrow action; CLOSED is still a
-- separate, later step by the reporter or a safety manager.
alter table safety_incidents drop constraint if exists safety_incidents_status_check;
alter table safety_incidents add constraint safety_incidents_status_check
  check (status in ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'));

comment on column safety_incidents.incident_number is 'Auto-generated, year-scoped (INC-<year>-NNN), assigned on report. Generated in app/api/safety-incidents/route.ts.';
comment on column safety_incidents.category is 'BIRD_STRIKE/MECHANICAL_SYSTEMS/OTHER_TECHNICAL are "technical" — auto-suggest assigned_to=Maintenance on report. See lib/permissions.ts TECHNICAL_INCIDENT_CATEGORIES.';
comment on column safety_incidents.resolution_note is 'Set by Maintenance via their narrow resolve action (INCIDENT_RESOLVE_ROLES) when marking status RESOLVED.';
