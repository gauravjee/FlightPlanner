-- verify-training-requirement-split.sql
-- ============================================================
-- Sanity-check queries for split-training-requirement-templates.sql.
-- Run each block in the Supabase SQL Editor and eyeball the results —
-- nothing here modifies data.
-- ============================================================

-- 1. Templates copied across? Should be > 0 (one row per requirement per
--    program you'd configured in Admin Setup -> Requirements before the
--    split).
SELECT count(*) AS template_count FROM training_requirement_templates;

-- 2. No template rows left behind in training_requirements. Should be 0.
SELECT count(*) AS leftover_template_rows
FROM training_requirements
WHERE student_id IS NULL;

-- 3. Every remaining row has a real student. Should return 0 rows (the
--    NOT NULL constraint from step 6 of the migration should make this
--    impossible, but worth confirming).
SELECT count(*) AS null_student_rows
FROM training_requirements
WHERE student_id IS NULL;

-- 4. How well did the template_id backfill work? "unmatched" rows are
--    pre-existing per-student requirements whose (program_code,
--    requirement_name) didn't match any template — not necessarily a
--    problem (could be a requirement manually added to just one student),
--    but worth a look if the count is high/unexpected.
SELECT
  count(*) FILTER (WHERE template_id IS NOT NULL) AS matched_to_template,
  count(*) FILTER (WHERE template_id IS NULL) AS unmatched,
  count(*) AS total
FROM training_requirements;

-- 5. Spot-check the unmatched rows, if any from #4.
SELECT id, student_id, program_code, requirement_name
FROM training_requirements
WHERE template_id IS NULL;

-- 6. Confirm the FK's ON DELETE behavior is SET NULL, not the default
--    (RESTRICT/NO ACTION) — this is what lets an admin delete a template
--    without it being blocked by students already assigned to it.
SELECT
  conname AS constraint_name,
  confdeltype AS delete_action  -- 'n' = SET NULL (expected), 'a' = NO ACTION, 'r' = RESTRICT
FROM pg_constraint
WHERE conrelid = 'training_requirements'::regclass
  AND confrelid = 'training_requirement_templates'::regclass;

-- 7. Quick look at what's actually in the templates table now — does it
--    look complete for every program you expect (PPL, CPL, IR, etc.)?
SELECT program_code, count(*) AS requirement_count
FROM training_requirement_templates
GROUP BY program_code
ORDER BY program_code;
