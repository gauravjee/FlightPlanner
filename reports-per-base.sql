-- reports-per-base.sql
-- Multi-base M5 (operator, 16 Oct): one Daily Flying Report per base per date,
-- and every Breath Analyser test records its base.
--
-- PART A - ADDITIVE (new columns only; no existing value is changed):
--   daily_flying_reports.base_id and ba_tests.base_id, NOT NULL DEFAULT 1.
--   Every existing row gets 1 (Base 1): every report and test so far was
--   Base 1's, as it is the only base that has been used.
--
-- PART B - CONSTRAINT CHANGE (no row is added, changed or deleted):
--   daily_flying_reports: "one report per date" (report_date UNIQUE,
--   constraint daily_flying_reports_report_date_key) becomes "one report per
--   date per base" (report_date, base_id). Looser, so every existing row
--   still satisfies it. If the old constraint has another name, the drop
--   fails and nothing in this file is applied.
--
-- All in one transaction: either everything applies or nothing does.
-- Run it immediately before deploying the M5 code. In between, saving a Daily
-- Flying Report fails (the old code names the old rule); reading still works.
--
-- Reversible while every row is still Base 1:
--   alter table public.daily_flying_reports drop constraint daily_flying_reports_date_base_key,
--     add constraint daily_flying_reports_report_date_key unique (report_date);
--   alter table public.daily_flying_reports drop column base_id;
--   alter table public.ba_tests drop column base_id;
-- (those drops delete the new columns' values - only run them with approval)

begin;

alter table public.daily_flying_reports
  add column base_id bigint not null default 1
  constraint daily_flying_reports_base_fk references public.bases(id) on delete restrict;

alter table public.ba_tests
  add column base_id bigint not null default 1
  constraint ba_tests_base_fk references public.bases(id) on delete restrict;

alter table public.daily_flying_reports
  drop constraint daily_flying_reports_report_date_key,
  add constraint daily_flying_reports_date_base_key unique (report_date, base_id);

commit;

-- Check (read-only): the new rule, and every existing row on Base 1.
select (select pg_get_constraintdef(oid) from pg_constraint where conname = 'daily_flying_reports_date_base_key') as report_rule,
       (select count(*) from public.daily_flying_reports) as reports,
       (select count(*) from public.daily_flying_reports where base_id = 1) as reports_base1,
       (select count(*) from public.ba_tests) as ba_tests,
       (select count(*) from public.ba_tests where base_id = 1) as ba_tests_base1;
