-- add-staff-master.sql
-- 2026-09-24. ADDITIVE ONLY — no approval-before-running needed under the
-- destructive-change rule: creates three new tables, two trigger functions,
-- three new nullable link columns (+ unique indexes), and backfills those NEW
-- tables/columns. No existing value is changed or deleted; the old
-- users.joining_date / instructors.joining_date / instructors.last_working_date
-- are only READ (copied), and stay as they are.
--
-- WHY (B2, operator decisions 2026-09-24 — claude/staff-master-design-2026-09-24.md §9a):
-- one staff record per person with an auto-issued staff ID:
--   PREFIX + 'E' + joining YYMM + running number, always 15 characters
--   ('HFA', Sep 2026, 1 -> HFAE26090000001). One sequence, never reset.
--   Contract AMEs: fixed prefix SUB with their own sequence (SUBE26100000001).
-- Logins (except super admin / students), instructors and AMEs link to it.
-- ID documents (PAN, Aadhaar, passport) are stored ENCRYPTED by the app
-- (lib/staff-crypto.ts) in id_documents_enc — the database never sees them
-- in plain text.
--
-- BACKFILL (operator 2026-09-24): existing staff are test data. The prefix is
-- set to TEST and everyone without a joining date gets 01 May 2026, so IDs are
-- TESTE2605000001, 002, ... At go-live the prefix is reset to the real one
-- starting at 1 — that is an UPDATE of stored values and needs explicit
-- approval at that time.
--
-- BEFORE RUNNING — read-only checks. Each should return NO rows, or the
-- matching for that person is ambiguous (tell Claude before running):
--   -- two instructors sharing one email:
--   select lower(email), count(*) from public.instructors where email <> ''
--   group by 1 having count(*) > 1;
--   -- two logins sharing one email (case-insensitive):
--   select lower(email), count(*) from public.users group by 1 having count(*) > 1;
--
-- REVERSIBLE (would lose every staff record, staff ID and encrypted document):
--   alter table public.users drop column staff_member_id;
--   alter table public.instructors drop column staff_member_id;
--   alter table public.ames drop column staff_member_id;
--   drop table public.staff_document_views;
--   drop table public.staff_members;
--   drop table public.staff_id_settings;
--   drop function public.staff_members_issue_id();
--   drop function public.staff_id_settings_guard();
--
-- Safe to re-run: IF NOT EXISTS / OR REPLACE, and the backfill skips itself
-- once staff_members has any rows.

-- 1. Settings: one row (id is always true).
create table if not exists public.staff_id_settings (
  id              boolean primary key default true check (id),
  prefix          text check (prefix ~ '^[A-Z0-9]{1,5}$' and prefix <> 'SUB'),
  next_number     integer not null default 1 check (next_number >= 1),
  sub_next_number integer not null default 1 check (sub_next_number >= 1),
  updated_at      timestamptz not null default now()
);
alter table public.staff_id_settings enable row level security;
insert into public.staff_id_settings (id, prefix) values (true, 'TEST') on conflict (id) do nothing;

-- The prefix is locked once an ID has been issued. (A deliberate go-live
-- reset sets prefix AND next_number back to 1 in one update — allowed.)
create or replace function public.staff_id_settings_guard()
returns trigger language plpgsql as $$
begin
  if new.prefix is distinct from old.prefix and old.next_number > 1 and new.next_number > 1 then
    raise exception 'The staff ID prefix is locked: staff IDs have already been issued.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists staff_id_settings_guard on public.staff_id_settings;
create trigger staff_id_settings_guard before update on public.staff_id_settings
  for each row execute function public.staff_id_settings_guard();

-- 2. Staff members.
create table if not exists public.staff_members (
  id                      bigint generated always as identity primary key,
  staff_id                text not null unique,             -- issued by the trigger below
  is_sub                  boolean not null default false,   -- contract AME: SUB series
  name                    text not null check (btrim(name) <> ''),
  joining_date            date not null,
  last_working_date       date,                             -- leaves at 17:00 IST that day (app)
  designation             text,
  department              text,
  employment_type         text check (employment_type in ('PERMANENT', 'CONTRACT')),
  mobile                  text,
  personal_email          text,
  date_of_birth           date,
  nationality             text,
  address                 text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  id_documents_enc        text,                             -- AES-256-GCM, lib/staff-crypto.ts
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint staff_members_dates check (last_working_date is null or last_working_date >= joining_date)
);
alter table public.staff_members enable row level security;

-- Issues the staff ID on insert (any staff_id sent by a client is replaced).
-- The UPDATE on the settings row locks it, so two staff saved at once get
-- different numbers; if the insert fails the counter bump rolls back with it
-- (no gaps). Formatting must match lib/staff-id.ts formatStaffId.
-- After insert, staff_id and is_sub can never change; the YYMM stays as
-- issued even if joining_date is corrected later.
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
drop trigger if exists staff_members_issue_id on public.staff_members;
create trigger staff_members_issue_id before insert or update on public.staff_members
  for each row execute function public.staff_members_issue_id();

-- 3. Who opened whose full ID documents (GDPR Art. 32 / DPDP accountability).
create table if not exists public.staff_document_views (
  id              bigint generated always as identity primary key,
  staff_member_id bigint not null references public.staff_members(id),
  viewed_by       uuid not null references public.users(id),
  viewed_at       timestamptz not null default now()
);
alter table public.staff_document_views enable row level security;

-- 4. Links: at most one login / instructor profile / AME entry per person.
alter table public.users       add column if not exists staff_member_id bigint references public.staff_members(id);
alter table public.instructors add column if not exists staff_member_id bigint references public.staff_members(id);
alter table public.ames        add column if not exists staff_member_id bigint references public.staff_members(id);
create unique index if not exists users_staff_member_id_key       on public.users (staff_member_id);
create unique index if not exists instructors_staff_member_id_key on public.instructors (staff_member_id);
create unique index if not exists ames_staff_member_id_key        on public.ames (staff_member_id);

-- 5. Backfill (test data): logins first (merged with their instructor row by
-- email), then instructors with no login, then AMEs. Joining date = the one
-- already recorded, else 01 May 2026 — pulled back to the last working day if
-- that is earlier (keeps the joining <= last-day check valid).
do $$
declare
  r    record;
  v_id bigint;
  v_n  integer := 0;
begin
  if exists (select 1 from public.staff_members) then
    raise notice 'staff_members already has rows — backfill skipped.';
    return;
  end if;

  for r in
    select * from (
      select distinct on (u.id)
             u.id as user_id, u.name, i.id as instructor_id, nullif(i.phone, '') as phone,
             i.last_working_date as lwd,
             least(coalesce(i.joining_date, u.joining_date, date '2026-05-01'), i.last_working_date) as jd
        from public.users u
        left join public.instructors i on i.email <> '' and lower(i.email) = lower(u.email)
       where u.role not in ('super_admin', 'student')
       order by u.id, i.id
    ) x order by jd, name
  loop
    insert into public.staff_members (name, joining_date, last_working_date, mobile)
    values (r.name, r.jd, r.lwd, r.phone) returning id into v_id;
    update public.users set staff_member_id = v_id where id = r.user_id;
    if r.instructor_id is not null then
      update public.instructors set staff_member_id = v_id where id = r.instructor_id;
    end if;
    v_n := v_n + 1;
  end loop;

  for r in
    select id, name, nullif(phone, '') as phone, last_working_date as lwd,
           least(coalesce(joining_date, date '2026-05-01'), last_working_date) as jd
      from public.instructors where staff_member_id is null order by jd, name
  loop
    insert into public.staff_members (name, joining_date, last_working_date, mobile)
    values (r.name, r.jd, r.lwd, r.phone) returning id into v_id;
    update public.instructors set staff_member_id = v_id where id = r.id;
    v_n := v_n + 1;
  end loop;

  for r in select id, name from public.ames where staff_member_id is null order by name loop
    insert into public.staff_members (name, joining_date) values (r.name, date '2026-05-01') returning id into v_id;
    update public.ames set staff_member_id = v_id where id = r.id;
    v_n := v_n + 1;
  end loop;

  raise notice 'Backfill: % staff records created.', v_n;
end;
$$;

-- Verify (read-only):
select * from public.staff_id_settings;
select s.staff_id, s.name, s.joining_date, s.last_working_date,
       u.role as login_role, i.id as instructor_id, a.id as ame_id
  from public.staff_members s
  left join public.users u on u.staff_member_id = s.id
  left join public.instructors i on i.staff_member_id = s.id
  left join public.ames a on a.staff_member_id = s.id
 order by s.staff_id;
-- Should be only super admins and students:
select name, role from public.users where staff_member_id is null order by role, name;
