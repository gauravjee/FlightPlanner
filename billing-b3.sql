-- billing-b3.sql (2026-10-21) — billing phase B3: ground-subject, no-show and late-cancellation fees.
-- See claude/billing-design-2026-10-20.md, "B3 plan".
--
-- PART A - ADDITIVE (one new nullable column, three new settings; no existing value changes):
--   ground_school_subjects.fee  charged once per student per subject on first class enrolment; blank / 0 = free.
--   fto_settings: billing_no_show_fee, billing_late_cancel_fee ('0' = no fee) and billing_fee_gst_rate ('18').
--
-- PART B - CONSTRAINT CHANGES (approved by the operator 21 Oct: "go B3, approve both rule changes"):
--   ledger_entries_source_check gains 'SUBJECT' and 'CANCEL_FEE'.
--   scheduled_flights_cancellation_reason_check gains 'LATE_CANCEL' ("Student late cancellation").
--   Only new allowed values; no row is changed. If a constraint has another name the drop fails and nothing applies.
--
-- All in one transaction. Reversible while nothing uses the new values: put the old lists back, drop the column and
-- delete the 3 settings (the drop and delete remove the new data - only with approval).

begin;

alter table public.ground_school_subjects
  add column fee numeric(12,2) constraint ground_school_subjects_fee_check check (fee is null or fee >= 0);

insert into public.fto_settings (setting_key, setting_value, description) values
  ('billing_no_show_fee', '0', 'Billing: fee (before GST) charged when a booking is cancelled as Student no-show. 0 = none.'),
  ('billing_late_cancel_fee', '0', 'Billing: fee (before GST) an admin may charge for a Student late cancellation. 0 = none.'),
  ('billing_fee_gst_rate', '18', 'Billing: GST % on ground-school subject, no-show and late-cancellation fees.')
on conflict (setting_key) do nothing;

alter table public.ledger_entries drop constraint ledger_entries_source_check,
  add constraint ledger_entries_source_check check (source in ('LOGBOOK', 'MANUAL', 'PACKAGE', 'SUBJECT', 'CANCEL_FEE'));

alter table public.scheduled_flights drop constraint scheduled_flights_cancellation_reason_check,
  add constraint scheduled_flights_cancellation_reason_check check (cancellation_reason is null or cancellation_reason = any (array[
    'WEATHER', 'MAINTENANCE', 'ON_LEAVE', 'REJECTED', 'STUDENT_NO_SHOW', 'INSTRUCTOR_UNAVAILABLE', 'ATC_AIRSPACE', 'OTHER', 'LATE_CANCEL']));

commit;

-- Check (read-only)
select (select count(*) from information_schema.columns where table_name = 'ground_school_subjects' and column_name = 'fee') as fee_column,
       (select count(*) from public.fto_settings where setting_key in ('billing_no_show_fee', 'billing_late_cancel_fee', 'billing_fee_gst_rate')) as fee_settings,
       (select pg_get_constraintdef(oid) from pg_constraint where conname = 'ledger_entries_source_check') as source_rule,
       (select pg_get_constraintdef(oid) from pg_constraint where conname = 'scheduled_flights_cancellation_reason_check') as cancel_rule;
