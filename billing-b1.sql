-- billing-b1.sql (2026-10-21) — billing phase B1, see claude/billing-design-2026-10-20.md
--
-- PART A - ADDITIVE (new tables, new nullable columns, new seed rows in the new tables):
--   billing_rates      one row per aircraft category (SE / ME / SIM), hourly rate + GST %. Seeded at 0 = not
--                      configured: nothing is charged until super admin sets a rate.
--   student_rates      per-student override of a category rate.
--   ledger_entries     every charge, payment, opening balance and adjustment. Never deleted: voided with a reason.
--                      Balance = sum(credit) - sum(debit) over non-voided rows (positive = money on account).
--   students.credit_limit / credit_note   admin-granted credit that lets a student book on a low balance.
--   fto_settings 'billing_booking_block'  'false' until switched on in Admin Setup -> Billing (no lock-out on day 1).
--
-- PART B - CONSTRAINT CHANGE (approved by the operator 21 Oct: "approve accounts role"):
--   users_role_check gains 'accounts'. Only a new allowed value; no row is changed. If the constraint has another
--   name the drop fails and nothing in this file is applied.
--
-- All in one transaction. Reversible while no user has role 'accounts' and the new tables are empty of real data:
--   restore the old role list on users_role_check; drop the 3 tables and the 2 student columns; delete the setting
--   (those drops delete the new data - only with approval).

begin;

create table public.billing_rates (
  id bigint generated always as identity primary key,
  category text not null constraint billing_rates_category_key unique
    constraint billing_rates_category_check check (category in ('SINGLE_ENGINE', 'MULTI_ENGINE', 'SIMULATOR')),
  hourly_rate numeric(12,2) not null default 0 constraint billing_rates_rate_check check (hourly_rate >= 0),
  gst_rate numeric(5,2) not null default 18 constraint billing_rates_gst_check check (gst_rate >= 0 and gst_rate <= 100),
  updated_at timestamptz not null default now()
);
alter table public.billing_rates enable row level security;
insert into public.billing_rates (category) values ('SINGLE_ENGINE'), ('MULTI_ENGINE'), ('SIMULATOR');

create table public.student_rates (
  student_id uuid not null constraint student_rates_student_fk references public.students(id) on delete cascade,
  category text not null constraint student_rates_category_check check (category in ('SINGLE_ENGINE', 'MULTI_ENGINE', 'SIMULATOR')),
  hourly_rate numeric(12,2) not null constraint student_rates_rate_check check (hourly_rate >= 0),
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (student_id, category)
);
alter table public.student_rates enable row level security;

create table public.ledger_entries (
  id bigint generated always as identity primary key,
  student_id uuid not null constraint ledger_entries_student_fk references public.students(id) on delete restrict,
  entry_date date not null default current_date,
  kind text not null constraint ledger_entries_kind_check check (kind in ('CHARGE', 'PAYMENT', 'OPENING', 'ADJUSTMENT')),
  source text not null default 'MANUAL' constraint ledger_entries_source_check check (source in ('LOGBOOK', 'MANUAL')),
  source_id text,
  description text not null default '',
  hours numeric(6,2),
  rate numeric(12,2),
  gst_rate numeric(5,2),
  gst_amount numeric(12,2) not null default 0,
  debit numeric(12,2) not null default 0 constraint ledger_entries_debit_check check (debit >= 0),
  credit numeric(12,2) not null default 0 constraint ledger_entries_credit_check check (credit >= 0),
  method text constraint ledger_entries_method_check check (method is null or method in ('CASH', 'BANK', 'UPI', 'CARD', 'CHEQUE')),
  reference text,
  created_by text,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by text,
  void_reason text,
  constraint ledger_entries_one_side check ((debit = 0) <> (credit = 0))
);
alter table public.ledger_entries enable row level security;
create index ledger_entries_student_idx on public.ledger_entries (student_id, entry_date);
-- One live charge per logbook entry, and one live opening balance per student.
create unique index ledger_entries_source_live on public.ledger_entries (source, source_id) where voided_at is null and source_id is not null;
create unique index ledger_entries_one_opening on public.ledger_entries (student_id) where voided_at is null and kind = 'OPENING';

alter table public.students add column credit_limit numeric(12,2) constraint students_credit_limit_check check (credit_limit is null or credit_limit >= 0);
alter table public.students add column credit_note text;

insert into public.fto_settings (setting_key, setting_value, description)
values ('billing_booking_block', 'false', 'Billing: refuse a booking when the student''s balance plus credit limit does not cover it (true/false).')
on conflict (setting_key) do nothing;

alter table public.users drop constraint users_role_check,
  add constraint users_role_check check (role = any (array['admin', 'instructor', 'maintenance', 'operations', 'safety_officer', 'student', 'super_admin', 'accounts']));

commit;

-- Check (read-only)
select (select count(*) from public.billing_rates) as rates,
       (select pg_get_constraintdef(oid) from pg_constraint where conname = 'users_role_check') as role_rule,
       (select setting_value from public.fto_settings where setting_key = 'billing_booking_block') as booking_block;
