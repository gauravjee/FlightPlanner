-- maintenance-booking-block.sql
-- Maintenance Phase 2 (19 Oct, operator): only schedule items marked "blocks booking" stop a booking
-- when OVERDUE; admin / super_admin can override with a reason, which the booking keeps.
--
-- ADDITIVE ONLY: two new columns. No existing value changes.
--   aircraft_maintenance_schedule_templates.blocks_booking: every existing item gets false (blocks nothing
--     until an admin ticks it).
--   scheduled_flights.maintenance_override_reason: null on every existing booking (= no override).
-- Reversible (with approval, as it deletes the new columns' values):
--   alter table public.aircraft_maintenance_schedule_templates drop column blocks_booking;
--   alter table public.scheduled_flights drop column maintenance_override_reason;

alter table public.aircraft_maintenance_schedule_templates
  add column blocks_booking boolean not null default false;

alter table public.scheduled_flights
  add column maintenance_override_reason text;

-- Check (read-only): no item blocks yet.
select count(*) filter (where blocks_booking) as blocking_items, count(*) as items
from public.aircraft_maintenance_schedule_templates;
