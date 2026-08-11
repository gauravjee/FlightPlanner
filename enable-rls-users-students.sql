-- enable-rls-users-students.sql
-- ============================================================
-- Companion step for the "Lock down users/students tables" patch.
--
-- WHY THIS IS NEEDED:
-- The patch moves the app's own network calls for the `users` and
-- `students` tables behind server-side API routes (using the
-- service-role key). That stops the *app* from ever sending this data to
-- a browser it shouldn't. It does NOT stop someone from taking the public
-- anon key (visible in your site's JS bundle — this is normal and
-- expected for a Supabase anon key) and calling Supabase's REST API
-- directly, e.g.:
--   curl "https://<project>.supabase.co/rest/v1/students?select=*" \
--     -H "apikey: <anon key>"
-- Right now, if Row Level Security is off (or has a permissive policy) on
-- `students`/`users`, that request returns everything — regardless of any
-- code changes in the app itself. RLS is the only thing that closes that.
--
-- WHAT THIS SCRIPT DOES:
-- Enables RLS on `users`, `students`, and `password_reset_tokens` with NO
-- policies defined. With RLS on and zero policies, every request made
-- with the anon key (or an authenticated Supabase Auth key) is denied by
-- default. Requests made with the service-role key are UNAFFECTED — RLS
-- never applies to the service role — so the app keeps working normally
-- through the new /api/students and /api/admin/users routes (which use
-- supabaseAdmin, i.e. the service-role key).
--
-- This is NOT the "full RLS/Supabase Auth migration" that was scoped out
-- of this pass — it doesn't require rewriting login or adding policies
-- keyed to auth.uid(). It's a blunt "anon key: no access" switch for
-- exactly the two most sensitive tables, safe specifically because the
-- app's server-side code already switched to the service-role key.
--
-- HOW TO RUN:
-- Supabase dashboard → SQL Editor → paste this → Run.
--
-- BEFORE RUNNING — IMPORTANT:
-- Only run this AFTER you've deployed the "Lock down users/students
-- tables" patch to production and confirmed (via the test plan) that
-- SUPABASE_SERVICE_KEY is set correctly on Vercel. If SUPABASE_SERVICE_KEY
-- is missing, lib/supabase-admin.ts silently falls back to the anon key —
-- which means enabling RLS here would break login and the students pages
-- for everyone until the env var is fixed. Double-check it's set first.
-- ============================================================

alter table public.users enable row level security;
alter table public.students enable row level security;
alter table public.password_reset_tokens enable row level security;

-- No policies are created — this intentionally makes both tables
-- unreadable/unwritable via the anon key. Service-role requests (the app's
-- API routes) bypass RLS entirely and are unaffected.

-- To verify afterwards, run this with your anon key (should return an
-- empty array / permission error, NOT your data):
--   curl "https://<project>.supabase.co/rest/v1/students?select=*" \
--     -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>"
