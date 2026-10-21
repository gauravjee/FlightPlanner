-- billing-b2.sql (2026-10-21) — billing phase B2: course packages and instalments.
-- See claude/billing-design-2026-10-20.md, "B2 plan".
--
-- PART A - ADDITIVE (new tables and functions; no existing row changes):
--   course_packages      per training program: fee, GST %, included SE / ME / SIM hours.
--   student_packages     a student's package; agreed fee and included hours copied at assignment. One ACTIVE each.
--   package_instalments  the payment plan (due date + amount); adds up to the charged total.
--   package_usage        hours a logbook entry took from a package (one row per logbook entry).
--   assign_student_package()      assigns a package, charges fee + GST and saves the plan in one transaction.
--   replace_package_instalments() replaces an active package's plan in one transaction (total must stay the same).
--
-- PART B - CONSTRAINT CHANGE (approved by the operator 21 Oct: "go B2, approve PACKAGE source"):
--   ledger_entries_source_check gains 'PACKAGE'. Only a new allowed value; no row is changed.
--
-- All in one transaction. Reversible while no package has been assigned: drop the 2 functions and 4 tables, and put
-- the old source list back (dropping deletes the new data - only with approval).

begin;

create table public.course_packages (
  id bigint generated always as identity primary key,
  program_id bigint not null constraint course_packages_program_fk references public.training_programs(id) on delete restrict,
  name text not null,
  fee numeric(12,2) not null constraint course_packages_fee_check check (fee >= 0),
  gst_rate numeric(5,2) not null default 18 constraint course_packages_gst_check check (gst_rate >= 0 and gst_rate <= 100),
  se_hours numeric(6,2) not null default 0 constraint course_packages_se_check check (se_hours >= 0),
  me_hours numeric(6,2) not null default 0 constraint course_packages_me_check check (me_hours >= 0),
  sim_hours numeric(6,2) not null default 0 constraint course_packages_sim_check check (sim_hours >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint course_packages_program_name_key unique (program_id, name)
);
alter table public.course_packages enable row level security;

create table public.student_packages (
  id bigint generated always as identity primary key,
  student_id uuid not null constraint student_packages_student_fk references public.students(id) on delete restrict,
  package_id bigint not null constraint student_packages_package_fk references public.course_packages(id) on delete restrict,
  course_id bigint constraint student_packages_course_fk references public.student_courses(id) on delete set null,
  name text not null,
  agreed_fee numeric(12,2) not null constraint student_packages_fee_check check (agreed_fee >= 0),
  gst_rate numeric(5,2) not null,
  se_hours numeric(6,2) not null,
  me_hours numeric(6,2) not null,
  sim_hours numeric(6,2) not null,
  status text not null default 'ACTIVE' constraint student_packages_status_check check (status in ('ACTIVE', 'CLOSED')),
  note text,
  assigned_by text,
  assigned_at timestamptz not null default now(),
  closed_by text,
  closed_at timestamptz
);
alter table public.student_packages enable row level security;
create unique index student_packages_one_active on public.student_packages (student_id) where status = 'ACTIVE';

create table public.package_instalments (
  id bigint generated always as identity primary key,
  student_package_id bigint not null constraint package_instalments_package_fk references public.student_packages(id) on delete cascade,
  due_date date not null,
  amount numeric(12,2) not null constraint package_instalments_amount_check check (amount > 0)
);
alter table public.package_instalments enable row level security;
create index package_instalments_package_idx on public.package_instalments (student_package_id, due_date);

create table public.package_usage (
  id bigint generated always as identity primary key,
  flight_record_id uuid not null constraint package_usage_record_key unique
    constraint package_usage_record_fk references public.flight_records(id) on delete restrict,
  student_package_id bigint not null constraint package_usage_package_fk references public.student_packages(id) on delete restrict,
  category text not null constraint package_usage_category_check check (category in ('SINGLE_ENGINE', 'MULTI_ENGINE', 'SIMULATOR')),
  hours numeric(6,2) not null constraint package_usage_hours_check check (hours > 0),
  created_at timestamptz not null default now()
);
alter table public.package_usage enable row level security;

-- Checks a plan (jsonb array of {due_date, amount}) adds up to p_total; inserts it for the package.
create or replace function public.billing_insert_plan(p_package bigint, p_plan jsonb, p_total numeric)
returns void language plpgsql as $$
declare v_sum numeric;
begin
  -- A free package (total 0) has no plan.
  if round(p_total, 2) = 0 and (p_plan is null or p_plan = '[]'::jsonb) then return; end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'array' or jsonb_array_length(p_plan) = 0 then
    raise exception 'BILLING: The payment plan needs at least one instalment.';
  end if;
  select coalesce(sum((x->>'amount')::numeric), 0) into v_sum from jsonb_array_elements(p_plan) x;
  if round(v_sum, 2) <> round(p_total, 2) then
    raise exception 'BILLING: The instalments add up to %, but the total is %.', round(v_sum, 2), round(p_total, 2);
  end if;
  insert into public.package_instalments (student_package_id, due_date, amount)
  select p_package, (x->>'due_date')::date, round((x->>'amount')::numeric, 2) from jsonb_array_elements(p_plan) x;
end $$;

create or replace function public.assign_student_package(
  p_student uuid, p_package bigint, p_agreed_fee numeric, p_plan jsonb, p_note text, p_by text, p_date date
) returns bigint language plpgsql as $$
declare
  v_pkg public.course_packages;
  v_course bigint;
  v_id bigint;
  v_fee numeric := round(p_agreed_fee, 2);
  v_gst numeric;
begin
  select * into v_pkg from public.course_packages where id = p_package and is_active;
  if not found then raise exception 'BILLING: That package does not exist or is inactive.'; end if;
  if exists (select 1 from public.student_packages where student_id = p_student and status = 'ACTIVE') then
    raise exception 'BILLING: This student already has an active package. Close it first.';
  end if;
  select id into v_course from public.student_courses where student_id = p_student and outcome = 'IN_PROGRESS';
  v_gst := round(v_fee * v_pkg.gst_rate / 100, 2);
  insert into public.student_packages (student_id, package_id, course_id, name, agreed_fee, gst_rate, se_hours, me_hours, sim_hours, note, assigned_by)
  values (p_student, v_pkg.id, v_course, v_pkg.name, v_fee, v_pkg.gst_rate, v_pkg.se_hours, v_pkg.me_hours, v_pkg.sim_hours, nullif(p_note, ''), p_by)
  returning id into v_id;
  perform public.billing_insert_plan(v_id, p_plan, v_fee + v_gst);
  if v_fee + v_gst > 0 then
    insert into public.ledger_entries (student_id, entry_date, kind, source, source_id, description, gst_rate, gst_amount, debit, created_by)
    values (p_student, p_date, 'CHARGE', 'PACKAGE', v_id::text, 'Course package: ' || v_pkg.name, v_pkg.gst_rate, v_gst, v_fee + v_gst, p_by);
  end if;
  return v_id;
end $$;

create or replace function public.replace_package_instalments(p_student_package bigint, p_plan jsonb)
returns void language plpgsql as $$
declare v_sp public.student_packages;
begin
  select * into v_sp from public.student_packages where id = p_student_package and status = 'ACTIVE' for update;
  if not found then raise exception 'BILLING: No active package with that id.'; end if;
  delete from public.package_instalments where student_package_id = v_sp.id;
  perform public.billing_insert_plan(v_sp.id, p_plan, v_sp.agreed_fee + round(v_sp.agreed_fee * v_sp.gst_rate / 100, 2));
end $$;

revoke execute on function public.billing_insert_plan(bigint, jsonb, numeric) from public;
revoke execute on function public.billing_insert_plan(bigint, jsonb, numeric) from anon;
revoke execute on function public.billing_insert_plan(bigint, jsonb, numeric) from authenticated;
grant execute on function public.billing_insert_plan(bigint, jsonb, numeric) to service_role;
revoke execute on function public.assign_student_package(uuid, bigint, numeric, jsonb, text, text, date) from public;
revoke execute on function public.assign_student_package(uuid, bigint, numeric, jsonb, text, text, date) from anon;
revoke execute on function public.assign_student_package(uuid, bigint, numeric, jsonb, text, text, date) from authenticated;
grant execute on function public.assign_student_package(uuid, bigint, numeric, jsonb, text, text, date) to service_role;
revoke execute on function public.replace_package_instalments(bigint, jsonb) from public;
revoke execute on function public.replace_package_instalments(bigint, jsonb) from anon;
revoke execute on function public.replace_package_instalments(bigint, jsonb) from authenticated;
grant execute on function public.replace_package_instalments(bigint, jsonb) to service_role;

alter table public.ledger_entries drop constraint ledger_entries_source_check,
  add constraint ledger_entries_source_check check (source in ('LOGBOOK', 'MANUAL', 'PACKAGE'));

commit;

-- Check (read-only)
select (select count(*) from information_schema.tables where table_schema = 'public'
          and table_name in ('course_packages', 'student_packages', 'package_instalments', 'package_usage')) as new_tables,
       (select count(*) from pg_proc where proname in ('assign_student_package', 'replace_package_instalments', 'billing_insert_plan')) as new_functions,
       (select pg_get_constraintdef(oid) from pg_constraint where conname = 'ledger_entries_source_check') as source_rule;
