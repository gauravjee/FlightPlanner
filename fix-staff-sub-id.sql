-- fix-staff-sub-id.sql
-- 2026-09-24. NOT DESTRUCTIVE — replaces one function's code only; no table,
-- row or stored value is touched. (Same rule as additive: no approval needed,
-- stated here as required.)
--
-- WHY: live test of B2 S2 — adding a contract AME (SUB ID) failed with
-- "Failed to save the staff record". The SUB branch of the ID trigger ran an
-- UPDATE on staff_id_settings with no WHERE clause, which Supabase refuses
-- (the regular branch has one, so regular IDs worked). The failed save
-- rolled back, so no SUB number was used up. add-staff-master.sql carries the
-- same fix for fresh installs.
--
-- REVERSIBLE: re-run the function block from add-staff-master.sql @ 4b5beb4
-- (would bring the bug back).
--
-- Safe to re-run: CREATE OR REPLACE. The trigger itself is unchanged (it
-- already points at this function).

create or replace function public.staff_members_issue_id()
returns trigger language plpgsql as $$
declare
  v_prefix text;
  v_n      integer;
  v_width  integer;
begin
  if tg_op = 'UPDATE' then
    if new.staff_id is distinct from old.staff_id or new.is_sub is distinct from old.is_sub then
      raise exception 'A staff ID can''t be changed once issued.';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if new.is_sub then
    update public.staff_id_settings set sub_next_number = sub_next_number + 1
     where id  -- WHERE needed: Supabase refuses an UPDATE without one (fix-staff-sub-id.sql)
      returning 'SUB', sub_next_number - 1 into v_prefix, v_n;
  else
    update public.staff_id_settings set next_number = next_number + 1
     where prefix is not null
      returning prefix, next_number - 1 into v_prefix, v_n;
  end if;
  if v_prefix is null then
    raise exception 'Set the staff ID prefix in Admin Setup first.';
  end if;

  v_width := 15 - length(v_prefix) - 5;
  if length(v_n::text) > v_width then
    raise exception 'Staff ID numbers for prefix % are used up.', v_prefix;
  end if;
  new.staff_id := v_prefix || 'E' || to_char(new.joining_date, 'YYMM') || lpad(v_n::text, v_width, '0');
  return new;
end;
$$;
