-- add-aircraft-hobbs-correction.sql (2026-10-10): admin correction of an aircraft's Hobbs reading alone (no flights change).
-- Additive: one column constraint relaxed (flight_record_id becomes nullable: NULL = aircraft-only correction) and one new function.
alter table public.hobbs_corrections alter column flight_record_id drop not null;

create or replace function public.set_aircraft_hobbs(p_aircraft bigint, p_new numeric, p_reason text, p_by text)
returns jsonb
language plpgsql
as $$
declare
  ac_hobbs numeric;
  ac_reg text;
  v_new numeric := round(p_new, 1);
  v_old numeric;
  last_end numeric;
begin
  select hobbs_time, registration into ac_hobbs, ac_reg from public.aircraft where id = p_aircraft for update;
  if not found then raise exception 'HOBBS: That aircraft no longer exists.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'HOBBS: A reason is required.'; end if;
  if v_new is null or v_new < 0 then raise exception 'HOBBS: Enter a valid reading.'; end if;
  v_old := round(ac_hobbs::numeric, 1);
  if v_new = v_old then raise exception 'HOBBS: That is already the reading.'; end if;
  if exists (select 1 from public.scheduled_flights where aircraft_id = p_aircraft and logbook_pending) then
    raise exception 'HOBBS: % has a pending logbook entry. Complete it first.', ac_reg;
  end if;
  select hobbs_end into last_end from public.flight_records
    where aircraft_id = p_aircraft order by flight_date desc, arrival_time desc limit 1;
  if v_new < last_end then
    raise exception 'HOBBS: % can''t read below its last flight''s Hobbs End (%).', ac_reg, last_end;
  end if;
  update public.aircraft set hobbs_time = v_new where id = p_aircraft;
  insert into public.hobbs_corrections (flight_record_id, aircraft_id, old_end, new_end, delta, flights_shifted, maintenance_shifted, aircraft_hobbs_before, aircraft_hobbs_after, reason, corrected_by)
    values (null, p_aircraft, v_old, v_new, v_new - v_old, 0, 0, ac_hobbs, v_new, trim(p_reason), p_by);
  return jsonb_build_object('registration', ac_reg, 'before', v_old, 'after', v_new);
end;
$$;

revoke execute on function public.set_aircraft_hobbs(bigint, numeric, text, text) from public;
revoke execute on function public.set_aircraft_hobbs(bigint, numeric, text, text) from anon;
revoke execute on function public.set_aircraft_hobbs(bigint, numeric, text, text) from authenticated;
grant execute on function public.set_aircraft_hobbs(bigint, numeric, text, text) to service_role;
