-- add-safety-incident-workflow.sql (2026-08-31)
-- Turns the minimal safety_incidents log (add-reports-module.sql) into a
-- workflow: an ICAO Doc 9859-style 5x5 risk matrix (severity x likelihood,
-- 1-5 each), corrective-action tracking, and an open/in-progress/closed
-- status — per explicit user decision, overriding the simpler Low/Medium/
-- High scheme originally proposed. See
-- claude/flightlogger-competitive-comparison-2026-08-31.md, gap #1.
--
-- risk_score is denormalized (severity * likelihood, 1-25) rather than a
-- generated column, so it can be filtered/sorted without recomputing
-- client-side — kept in sync by app/api/safety-incidents/[id]/route.ts on
-- every write; this table has no other writer of these columns.
alter table safety_incidents add column if not exists risk_severity smallint check (risk_severity between 1 and 5);
alter table safety_incidents add column if not exists risk_likelihood smallint check (risk_likelihood between 1 and 5);
alter table safety_incidents add column if not exists risk_score smallint;
alter table safety_incidents add column if not exists status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'CLOSED'));
alter table safety_incidents add column if not exists corrective_action text;
alter table safety_incidents add column if not exists assigned_to text;
alter table safety_incidents add column if not exists closed_by text;
alter table safety_incidents add column if not exists closed_at timestamptz;

comment on column safety_incidents.risk_score is 'severity * likelihood (1-25), ICAO Doc 9859 5x5 matrix. Denormalized for filtering/sorting.';
comment on column safety_incidents.status is 'OPEN (just logged, not yet triaged) -> IN_PROGRESS (risk rated / corrective action underway) -> CLOSED (corrective action complete).';
