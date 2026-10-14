-- add-move-aircraft-base-fn.sql
-- Multi-base fix (15 Oct): moving an aircraft to another base and writing its
-- aircraft_base_moves log row now happen in ONE transaction. Before, the API
-- route updated aircraft.current_base_id and then inserted the log row in a
-- second call; if the insert failed, the aircraft moved with no history.
--
-- Called only by POST /api/aircraft/[id]/base (service role). Returns true
-- when moved, false when the aircraft is no longer at p_from_base_id (someone
-- else moved it first), so the route can answer 409.
--
-- ADDITIVE ONLY: creates one new function; touches no existing data.
-- RUN THIS BEFORE deploying the code that calls it, or aircraft moves fail.
create or replace function public.move_aircraft_base(
  p_aircraft_id bigint,
  p_from_base_id bigint,
  p_to_base_id bigint,
  p_moved_by uuid,
  p_note text
)
returns boolean
language plpgsql
as $$
begin
  update public.aircraft
     set current_base_id = p_to_base_id
   where id = p_aircraft_id
     and current_base_id is not distinct from p_from_base_id;
  if not found then
    return false;
  end if;

  insert into public.aircraft_base_moves (aircraft_id, from_base_id, to_base_id, moved_by, note)
  values (p_aircraft_id, p_from_base_id, p_to_base_id, p_moved_by, p_note);
  return true;
end;
$$;

-- New functions are executable by PUBLIC and exposed by PostgREST; only the
-- service-role server route may call this one.
revoke execute on function public.move_aircraft_base(bigint, bigint, bigint, uuid, text) from public;
revoke execute on function public.move_aircraft_base(bigint, bigint, bigint, uuid, text) from anon;
revoke execute on function public.move_aircraft_base(bigint, bigint, bigint, uuid, text) from authenticated;
grant execute on function public.move_aircraft_base(bigint, bigint, bigint, uuid, text) to service_role;

-- Check: should return one row, move_aircraft_base.
select proname from pg_proc where proname = 'move_aircraft_base';
