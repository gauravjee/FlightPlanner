-- billing-b4b.sql (2026-10-22) — billing start date for the reconciliation report.
-- Operator, 22 Oct: "Yes please add before billing". See claude/billing-design-2026-10-20.md.
--
-- ADDITIVE ONLY: one new fto_settings row, blank = no start date. No existing value changes.
-- Reversible: delete the row (only with approval).

insert into public.fto_settings (setting_key, setting_value, description)
values ('billing_start_date', '', 'Billing: flights before this date (YYYY-MM-DD) with nothing charged show as "Before billing" in the reconciliation report. Blank = none.')
on conflict (setting_key) do nothing;

-- Check (read-only)
select count(*) as start_date_setting from public.fto_settings where setting_key = 'billing_start_date';
