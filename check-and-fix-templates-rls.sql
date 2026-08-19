-- check-and-fix-templates-rls.sql
-- ============================================================
-- Diagnoses why Admin Setup -> Requirements shows "0 items" in the browser
-- console despite training_requirement_templates having real rows (10
-- confirmed via verify-training-requirement-split.sql, run as the
-- postgres/service-role user which bypasses RLS entirely).
--
-- The app's RequirementsTab.tsx queries this table with the ANON key
-- (client-side supabase, not supabaseAdmin) — same as training_requirements
-- already does today, successfully. If RLS is ON with zero policies on the
-- NEW table (possible default behavior for tables created via the SQL
-- Editor on some Supabase projects), PostgREST silently returns an empty
-- array for anon-key requests instead of an error — which matches exactly
-- what you're seeing in the console.
-- ============================================================

-- 1. CHECK: does this table have RLS enabled?
--    relrowsecurity = true means RLS is ON (the likely cause).
--    relrowsecurity = false means RLS is OFF — if this comes back false,
--    STOP HERE and tell me, because the cause is something else and
--    turning RLS off won't help.
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN ('training_requirement_templates', 'training_requirements')
ORDER BY relname;

-- 2. FIX (only run this if step 1 showed relrowsecurity = true for
--    training_requirement_templates): disable RLS on the new table so it
--    matches training_requirements' existing behavior — same pattern this
--    codebase already uses for holidays/safety_incidents/
--    daily_flying_reports (see those tables' own migration SQL files,
--    which explicitly disable RLS for tables the anon key reads/writes
--    directly, since none of these have been migrated to server-side
--    API routes yet).
ALTER TABLE training_requirement_templates DISABLE ROW LEVEL SECURITY;

-- 3. RE-VERIFY: should now show false for both rows.
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN ('training_requirement_templates', 'training_requirements')
ORDER BY relname;
