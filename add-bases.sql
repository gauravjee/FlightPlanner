-- add-bases.sql (2026-10-15) — multi-base step M1, see claude/multi-base-design-2026-10-15.md
-- ADDITIVE ONLY: two new tables and new columns. No stored value is changed.
-- Base 1 is created from today's fto_settings, and every existing aircraft, person, booking, record,
-- class and roster row gets base 1 through the new column's default. Holidays get no base (NULL = school-wide).
-- fto_settings is left as it is. Reversible: drop the 10 new columns, then the 2 tables.
begin;

create table public.bases (
  id bigint generated always as identity primary key,
  name text not null constraint bases_name_key unique,
  code text not null constraint bases_code_key unique,
  airport_code text,
  location_name text,
  latitude text,
  longitude text,
  time_slot_start text not null default '06:00',
  time_slot_end text not null default '20:00',
  time_slot_interval integer not null default 15,
  weekly_off_days text not null default '',
  partial_weekly_off_days text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.bases enable row level security;

-- Base 1 = today's settings (same text formats as fto_settings, so the existing parsers read them).
insert into public.bases (name, code, airport_code, location_name, latitude, longitude,
  time_slot_start, time_slot_end, time_slot_interval, weekly_off_days, partial_weekly_off_days)
select
  coalesce(nullif(max(setting_value) filter (where setting_key = 'location_name'), ''), 'Base 1'),
  'B1',
  nullif(max(setting_value) filter (where setting_key = 'airport_code'), ''),
  nullif(max(setting_value) filter (where setting_key = 'location_name'), ''),
  nullif(max(setting_value) filter (where setting_key = 'latitude'), ''),
  nullif(max(setting_value) filter (where setting_key = 'longitude'), ''),
  coalesce(nullif(max(setting_value) filter (where setting_key = 'time_slot_start'), ''), '06:00'),
  coalesce(nullif(max(setting_value) filter (where setting_key = 'time_slot_end'), ''), '20:00'),
  coalesce(nullif(max(setting_value) filter (where setting_key = 'time_slot_interval'), '')::integer, 15),
  coalesce(max(setting_value) filter (where setting_key = 'weekly_off_days'), ''),
  coalesce(max(setting_value) filter (where setting_key = 'partial_weekly_off_days'), '')
from public.fto_settings;

-- The defaults below say "1": stop here if the seed did not get id 1.
do $$ begin
  if (select id from public.bases where code = 'B1') <> 1 then raise exception 'Base 1 seed did not get id 1'; end if;
end $$;

create table public.aircraft_base_moves (
  id bigint generated always as identity primary key,
  aircraft_id bigint not null constraint aircraft_base_moves_aircraft_fk references public.aircraft(id) on delete restrict,
  from_base_id bigint constraint aircraft_base_moves_from_fk references public.bases(id) on delete restrict,
  to_base_id bigint not null constraint aircraft_base_moves_to_fk references public.bases(id) on delete restrict,
  moved_by uuid,
  moved_at timestamptz not null default now(),
  note text
);
alter table public.aircraft_base_moves enable row level security;

-- A constant default fills every existing row with base 1 (and new rows, until the app sets a base itself).
alter table public.aircraft add column current_base_id bigint default 1 constraint aircraft_current_base_fk references public.bases(id) on delete restrict;
alter table public.instructors add column home_base_id bigint default 1 constraint instructors_home_base_fk references public.bases(id) on delete restrict;
alter table public.students add column home_base_id bigint default 1 constraint students_home_base_fk references public.bases(id) on delete restrict;
alter table public.staff_members add column home_base_id bigint default 1 constraint staff_members_home_base_fk references public.bases(id) on delete restrict;
alter table public.scheduled_flights add column base_id bigint default 1 constraint scheduled_flights_base_fk references public.bases(id) on delete restrict;
alter table public.flight_records add column base_id bigint default 1 constraint flight_records_base_fk references public.bases(id) on delete restrict;
alter table public.ground_school_classes add column base_id bigint default 1 constraint ground_school_classes_base_fk references public.bases(id) on delete restrict;
alter table public.instructor_roster add column base_id bigint default 1 constraint instructor_roster_base_fk references public.bases(id) on delete restrict;
alter table public.instructor_roster_exceptions add column base_id bigint default 1 constraint instructor_roster_exceptions_base_fk references public.bases(id) on delete restrict;
-- Holidays: NULL = school-wide (every existing holiday); a value = that base only.
alter table public.holidays add column base_id bigint constraint holidays_base_fk references public.bases(id) on delete restrict;

commit;
