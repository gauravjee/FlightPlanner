-- check-existing-rls-policies.sql
-- ============================================================
-- training_requirements has RLS enabled (confirmed) yet the app reads/
-- writes it successfully via the anon key — so it must have actual
-- policies granting that access, not just RLS-on-with-nothing. The new
-- training_requirement_templates table has RLS on (inherited/default) but
-- presumably zero policies, which is why it silently returns 0 rows.
--
-- This lists every policy on both tables so we can see exactly what's
-- permitting training_requirements through, and either replicate it onto
-- training_requirement_templates or decide disabling RLS there is simpler
-- and equally safe.
-- ============================================================

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,     -- PERMISSIVE or RESTRICTIVE
  roles,          -- which role(s) this policy applies to
  cmd,            -- SELECT / INSERT / UPDATE / DELETE / ALL
  qual,           -- USING expression (read access condition)
  with_check      -- WITH CHECK expression (write access condition)
FROM pg_policies
WHERE tablename IN ('training_requirements', 'training_requirement_templates')
ORDER BY tablename, policyname;
