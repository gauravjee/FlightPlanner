-- fix-templates-rls-policy.sql
-- ============================================================
-- training_requirements has exactly one RLS policy, confirmed via
-- check-existing-rls-policies.sql:
--   "Allow all requirements" — PERMISSIVE, roles {public}, cmd ALL,
--   USING (true), WITH CHECK (true)
-- i.e. RLS is technically ON but the policy allows everyone to do
-- everything — functionally equivalent to RLS being off, just expressed
-- as an explicit policy instead. training_requirement_templates inherited
-- RLS-on but has zero policies, so every anon-key request is silently
-- denied (returns 0 rows, no error) — this is why Admin Setup ->
-- Requirements has been showing blank.
--
-- This creates the same policy on the new table, so its access behavior
-- exactly matches its sibling table's — nothing gets MORE locked down or
-- MORE open than what training_requirements already allows today.
-- ============================================================

CREATE POLICY "Allow all requirement templates"
ON training_requirement_templates
AS PERMISSIVE
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- Verify: should now show one row for each table.
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('training_requirements', 'training_requirement_templates')
ORDER BY tablename;
