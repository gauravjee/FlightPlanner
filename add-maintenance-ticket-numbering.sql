-- add-maintenance-ticket-numbering.sql (2026-09-03)
-- RMT/IMT ticket numbering for maintenance_records, mirroring the
-- INC-2026-NNN pattern from add-safety-incident-numbering-and-maintenance-
-- routing.sql. See claude/handoff-2026-08-31.md part 10 for the full
-- background and the (corrected) prefix meanings.
--
--   RMT-2026-xxxxxx — Regular Maintenance Ticket: a staff-logged record
--   from the Maintenance page's own "Log Maintenance" form (is_squawk =
--   false/null).
--   IMT-2026-xxxxxx — Incident Maintenance Ticket: a pilot-reported
--   squawk filed through Report a Defect (is_squawk = true).
--
-- RMT and IMT are two independent, year-scoped counters sharing this one
-- column — the ticket's own prefix says which counter it came from, so a
-- single "max + 1" query per prefix is enough; see nextTicketNumber() in
-- app/api/maintenance-records/route.ts. Generated in the app layer, not a
-- DB trigger/sequence, matching this table's existing is_squawk/reported_by
-- convention of denormalized-but-app-owned columns. The unique index below
-- is the safety net: a same-year, same-prefix race between two concurrent
-- inserts would collide and the route retries once.
alter table maintenance_records add column if not exists ticket_number text;

create unique index if not exists idx_maintenance_records_ticket_number on maintenance_records (ticket_number) where ticket_number is not null;

comment on column maintenance_records.ticket_number is 'Auto-generated, year-scoped (RMT-<year>-NNN staff-logged, IMT-<year>-NNN pilot squawk per is_squawk), assigned on insert. Generated in app/api/maintenance-records/route.ts.';
