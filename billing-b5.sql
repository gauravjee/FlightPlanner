-- billing-b5.sql (2026-10-22) — B5a: school-wide GST rate history, refund payouts, receipts for older payments, and the
-- duplicate-enrolment rule. See claude/billing-design-2026-10-20.md, "B5 plan".
--
-- PART A - ADDITIVE (new table, new nullable column, new function, new rows in new tables):
--   gst_rates (rate, effective_from)  one school-wide GST %; the date of a charge picks the rate. Seeded with 18% from
--                                     2017-07-01 (the GST start date): change it in Admin Setup -> Billing if your CA says so.
--   billing_gst_rate(date)            that rate on a date, or 0 while the school has no valid GSTIN.
--   ledger_entries.bank_name          bank of a refund payout (with the UTR in reference).
--   Receipts for live payments that were recorded before receipts existed (none, or very few): one each, numbered in
--   the receipt series by payment date. Only inserts into billing_documents / billing_doc_counters.
--
-- PART B - CHANGES NEEDING THE OPERATOR'S OK:
--   1. ground_school_enrollment gets a unique rule on (class_id, student_id) (operator: "Duplicate enrolment - fix it").
--      If any student is already in a class twice, the whole file stops here and nothing is applied — the check below
--      lists them first.
--   2. assign_student_package is replaced again (same signature and permissions): the package GST rate is now
--      billing_gst_rate(p_date) instead of the package's own GST %. No row is changed. Reversible: re-run billing-gst.sql.
--
-- All in one transaction.

-- Before running: duplicates that would stop Part B 1 (read-only; expect no rows)
select class_id, student_id, count(*) from public.ground_school_enrollment group by class_id, student_id having count(*) > 1;

begin;

create table public.gst_rates (
  id bigint generated always as identity primary key,
  rate numeric(5,2) not null constraint gst_rates_rate_check check (rate >= 0 and rate <= 100),
  effective_from date not null constraint gst_rates_from_key unique,
  created_at timestamptz not null default now()
);
alter table public.gst_rates enable row level security;
insert into public.gst_rates (rate, effective_from) values (18, '2017-07-01');

create or replace function public.billing_gst_rate(p_date date) returns numeric language sql stable as $$
  select case when public.billing_gst_registered()
    then coalesce((select rate from public.gst_rates where effective_from <= p_date order by effective_from desc limit 1), 0)
    else 0 end
$$;
revoke execute on function public.billing_gst_rate(date) from public, anon, authenticated;
grant execute on function public.billing_gst_rate(date) to service_role;

alter table public.ledger_entries add column bank_name text;

-- Receipts for live payments that have none (seller = legal name or school name; buyer = the student as now).
do $$
declare p record; v_prefix text;
begin
  select coalesce(nullif(trim(setting_value), ''), 'RCT') into v_prefix from public.fto_settings where setting_key = 'billing_receipt_prefix';
  for p in
    select l.id, l.student_id, l.entry_date, l.credit, l.created_by, s.name, s.enrollment_id, s.address, s.billing_state
    from public.ledger_entries l join public.students s on s.id = l.student_id
    where l.kind = 'PAYMENT' and l.voided_at is null
      and not exists (select 1 from public.billing_documents d where d.doc_type = 'RECEIPT' and d.payment_entry_id = l.id)
    order by l.entry_date, l.id
  loop
    insert into public.billing_documents (doc_type, doc_number, doc_date, student_id, payment_entry_id, seller, buyer, total, created_by)
    values ('RECEIPT', public.billing_next_number('RECEIPT', coalesce(v_prefix, 'RCT'), p.entry_date), p.entry_date, p.student_id, p.id,
      jsonb_build_object('name', coalesce(nullif((select trim(setting_value) from public.fto_settings where setting_key = 'billing_legal_name'), ''),
                                          (select setting_value from public.fto_settings where setting_key = 'school_name'), ''),
                         'address', coalesce((select trim(setting_value) from public.fto_settings where setting_key = 'billing_address'), ''),
                         'gstin', '', 'state', ''),
      jsonb_build_object('name', p.name, 'enrollmentId', coalesce(p.enrollment_id, ''), 'address', coalesce(p.address, ''), 'state', coalesce(p.billing_state, '')),
      p.credit, coalesce(p.created_by, 'billing-b5.sql'));
  end loop;
end $$;

-- Part B 1
create unique index ground_school_enrollment_class_student_key on public.ground_school_enrollment (class_id, student_id);

-- Part B 2
create or replace function public.assign_student_package(
  p_student uuid, p_package bigint, p_agreed_fee numeric, p_plan jsonb, p_note text, p_by text, p_date date
) returns bigint language plpgsql as $$
declare
  v_pkg public.course_packages;
  v_course bigint;
  v_id bigint;
  v_fee numeric := round(p_agreed_fee, 2);
  v_rate numeric;
  v_gst numeric;
begin
  select * into v_pkg from public.course_packages where id = p_package and is_active;
  if not found then raise exception 'BILLING: That package does not exist or is inactive.'; end if;
  if exists (select 1 from public.student_packages where student_id = p_student and status = 'ACTIVE') then
    raise exception 'BILLING: This student already has an active package. Close it first.';
  end if;
  select id into v_course from public.student_courses where student_id = p_student and outcome = 'IN_PROGRESS';
  v_rate := public.billing_gst_rate(p_date); -- B5: the school-wide rate on the day the package is charged
  v_gst := round(v_fee * v_rate / 100, 2);
  insert into public.student_packages (student_id, package_id, course_id, name, agreed_fee, gst_rate, se_hours, me_hours, sim_hours, note, assigned_by)
  values (p_student, v_pkg.id, v_course, v_pkg.name, v_fee, v_rate, v_pkg.se_hours, v_pkg.me_hours, v_pkg.sim_hours, nullif(p_note, ''), p_by)
  returning id into v_id;
  perform public.billing_insert_plan(v_id, p_plan, v_fee + v_gst);
  if v_fee + v_gst > 0 then
    insert into public.ledger_entries (student_id, entry_date, kind, source, source_id, description, gst_rate, gst_amount, debit, created_by)
    values (p_student, p_date, 'CHARGE', 'PACKAGE', v_id::text, 'Course package: ' || v_pkg.name, v_rate, v_gst, v_fee + v_gst, p_by);
  end if;
  return v_id;
end $$;

commit;

-- Check (read-only)
select (select count(*) from public.gst_rates) as gst_rates,
       public.billing_gst_rate(current_date) as gst_rate_today,
       (select count(*) from information_schema.columns where table_name = 'ledger_entries' and column_name = 'bank_name') as bank_name_column,
       (select count(*) from public.ledger_entries l where l.kind = 'PAYMENT' and l.voided_at is null
          and not exists (select 1 from public.billing_documents d where d.doc_type = 'RECEIPT' and d.payment_entry_id = l.id)) as payments_without_receipt,
       (select count(*) from pg_indexes where indexname = 'ground_school_enrollment_class_student_key') as enrolment_rule,
       (select position('billing_gst_rate' in prosrc) > 0 from pg_proc where proname = 'assign_student_package') as package_uses_school_rate;
