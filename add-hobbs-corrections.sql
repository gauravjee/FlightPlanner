-- add-hobbs-corrections.sql (2026-10-10) — see claude/hobbs-correction-design-2026-10-10.md
-- ADDITIVE ONLY: one new table, one new function. Existing rows are only changed later, by an admin's correction in the app.
create table public.hobbs_corrections (
  id bigint generated always as identity primary key,
  flight_record_id uuid not null constraint hobbs_corrections_flight_record_fk references public.flight_records(id) on delete restrict,
  aircraft_id bigint not null constraint hobbs_corrections_aircraft_fk references public.aircraft(id) on delete restrict,
  old_end numeric(6,1) not null,
  new_end numeric(6,1) not null,
  delta numeric(6,1) not null,
  flights_shifted integer not null,
  maintenance_shifted integer not null,
  aircraft_hobbs_before numeric,
  aircraft_hobbs_after numeric,
  reason text not null,
  corrected_by text not null,
  corrected_at timestamptz not null default now()
);
alter table public.hobbs_corrections enable row level security;

create or replace function public.correct_hobbs_end(p_record uuid, p_new numeric, p_reason text, p_by text, p_dry_run boolean default false)
returns jsonb
language plpgsql
as $$
declare
  r public.flight_records%rowtype;
  ac_hobbs numeric;
  ac_reg text;
  v_new numeric := round(p_new, 1);
  d numeric;
  n_flights integer;
  n_mx integer;
  min_shifted numeric;
  ac_d numeric;
begin
  select * into r from public.flight_records where id = p_record;
  if not found then raise exception 'HOBBS: That flight record no longer exists.'; end if;
  select hobbs_time, registration into ac_hobbs, ac_reg from public.aircraft where id = r.aircraft_id for update;
  if coalesce(trim(p_reason), '') = '' then raise exception 'HOBBS: A reason is required.'; end if;
  if v_new is null or v_new <= r.hobbs_start then raise exception 'HOBBS: Hobbs End must be greater than Hobbs Start (%).', r.hobbs_start; end if;
  d := v_new - r.hobbs_end;
  if d = 0 then raise exception 'HOBBS: That is already the Hobbs End.'; end if;
  if exists (select 1 from public.scheduled_flights where aircraft_id = r.aircraft_id and logbook_pending) then
    raise exception 'HOBBS: % has a pending logbook entry. Complete it first.', ac_reg;
  end if;
  if exists (select 1 from public.flight_records o where o.aircraft_id = r.aircraft_id and o.id <> r.id
             and o.hobbs_start < r.hobbs_end and o.hobbs_end > r.hobbs_start) then
    raise exception 'HOBBS: Another % record overlaps this one''s Hobbs range. Fix that first.', ac_reg;
  end if;
  select count(*), min(hobbs_start) into n_flights, min_shifted from public.flight_records
    where aircraft_id = r.aircraft_id and id <> r.id and hobbs_start >= r.hobbs_end;
  select count(*) into n_mx from public.maintenance_records
    where aircraft_id = r.aircraft_id and hobbs_at_completion >= r.hobbs_end;
  ac_d := case when ac_hobbs >= r.hobbs_end then d else 0 end;
  if min_shifted + d < 0 or ac_hobbs + ac_d < 0 then raise exception 'HOBBS: The shift would make a reading negative.'; end if;
  if not p_dry_run then
    update public.flight_records set hobbs_end = v_new where id = r.id;
    update public.flight_records set hobbs_start = hobbs_start + d, hobbs_end = hobbs_end + d
      where aircraft_id = r.aircraft_id and id <> r.id and hobbs_start >= r.hobbs_end;
    update public.maintenance_records set hobbs_at_completion = hobbs_at_completion + d
      where aircraft_id = r.aircraft_id and hobbs_at_completion >= r.hobbs_end;
    update public.aircraft set hobbs_time = round((hobbs_time::numeric + ac_d), 1) where id = r.aircraft_id and ac_d <> 0;
    insert into public.hobbs_corrections (flight_record_id, aircraft_id, old_end, new_end, delta, flights_shifted, maintenance_shifted, aircraft_hobbs_before, aircraft_hobbs_after, reason, corrected_by)
      values (r.id, r.aircraft_id, r.hobbs_end, v_new, d, n_flights, n_mx, ac_hobbs, round(ac_hobbs::numeric + ac_d, 1), trim(p_reason), p_by);
  end if;
  return jsonb_build_object('registration', ac_reg, 'oldEnd', r.hobbs_end, 'newEnd', v_new, 'delta', d,
    'flightsShifted', n_flights, 'maintenanceShifted', n_mx,
    'aircraftBefore', round(ac_hobbs::numeric, 1), 'aircraftAfter', round(ac_hobbs::numeric + ac_d, 1), 'dryRun', p_dry_run);
end;
$$;

revoke execute on function public.correct_hobbs_end(uuid, numeric, text, text, boolean) from public;
revoke execute on function public.correct_hobbs_end(uuid, numeric, text, text, boolean) from anon;
revoke execute on function public.correct_hobbs_end(uuid, numeric, text, text, boolean) from authenticated;
grant execute on function public.correct_hobbs_end(uuid, numeric, text, text, boolean) to service_role;
