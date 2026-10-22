-- billing-gst.sql (2026-10-22) — GST only once the school has a valid GSTIN (operator, 22 Oct: "GST gets charged only
-- if the flight school enters a valid GSTIN"). Flights and fees follow this in the app; packages are charged by the
-- database function below, so it needs the same rule.
--
-- PART A - ADDITIVE: function billing_gst_registered() — true when fto_settings 'billing_gstin' is a well-formed GSTIN.
--   (The app refuses to save a GSTIN whose check character is wrong, so a saved one is fully valid.)
--
-- PART B - REPLACES AN EXISTING FUNCTION (needs the operator's OK): assign_student_package, same signature and same
--   permissions. Only change: GST rate = the package's GST % when billing_gst_registered(), else 0 — used for the
--   charge, its GST amount and the copy stored on student_packages. No row is changed; packages already assigned keep
--   their charge. Reversible: re-run the function from billing-b2.sql.

begin;

create or replace function public.billing_gst_registered() returns boolean language sql stable as $$
  select coalesce((select upper(trim(setting_value)) from public.fto_settings where setting_key = 'billing_gstin')
    ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$', false)
$$;
revoke execute on function public.billing_gst_registered() from public, anon, authenticated;
grant execute on function public.billing_gst_registered() to service_role;

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
  v_rate := case when public.billing_gst_registered() then v_pkg.gst_rate else 0 end;
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
select (select count(*) from pg_proc where proname = 'billing_gst_registered') as gst_function,
       public.billing_gst_registered() as gst_registered_now,
       (select position('billing_gst_registered' in prosrc) > 0 from pg_proc where proname = 'assign_student_package') as package_uses_it;
