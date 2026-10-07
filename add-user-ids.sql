-- add-user-ids.sql (2026-10-08) — B1 user ID login
-- (claude/user-id-login-design-2026-10-08.md)
--
-- ADDITIVE ONLY: two new nullable columns on users, two indexes, and a
-- backfill that fills ONLY the new user_id column where it is still empty.
-- No existing value is changed or removed. Safe to run more than once.
--
-- user_id            the login user ID. Set automatically when a login is
--                    created (staff -> staff ID, student -> enrollment
--                    number); the person may change it once.
-- user_id_changed_at null = the one change is still available; set when used.
--                    A super admin can clear it to allow one more change.

alter table public.users add column if not exists user_id text;
alter table public.users add column if not exists user_id_changed_at timestamptz;

-- Temporary IDs for existing logins (super admins have none: they set their own).
update public.users u set user_id = s.staff_id
  from public.staff_members s
  where u.user_id is null and u.role <> 'student' and u.staff_member_id = s.id;

update public.users u set user_id = st.enrollment_id
  from public.students st
  where u.user_id is null and u.role = 'student' and u.student_id = st.id;

-- Unique regardless of letter case ("ravi.k" and "RAVI.K" are the same ID).
create unique index if not exists users_user_id_lower_key on public.users (lower(user_id));
-- Login by email is now case-insensitive too.
create index if not exists users_email_lower_idx on public.users (lower(email));
