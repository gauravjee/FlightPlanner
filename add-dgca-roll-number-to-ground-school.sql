-- add-dgca-roll-number-to-ground-school.sql
-- ============================================================
-- Ground school subjects (Air Regulations, Air Navigation, etc.) are
-- externally examined by DGCA, not by the FTO itself — the FTO only
-- delivers the classes/coaching. A recorded PASS should be traceable to
-- the student's actual DGCA exam, so this adds a roll number column
-- alongside the exam_score/exam_result columns that already exist on
-- ground_school_enrollment.
--
-- Nullable at the database level — a ground_school_enrollment row exists
-- in states before any exam has happened (PENDING enrollment in an
-- upcoming class, ABSENT, etc.) where a roll number doesn't apply yet.
-- "Required to record a PASS" is enforced in the app itself (both the
-- Direct Exam Entry form on Ground School -> Progress, and the
-- attendance page's per-student exam editor), not at the database level,
-- so it doesn't block those non-exam states.
--
-- No RLS/policy changes needed — this adds a column to an existing table
-- that already has a working policy (unlike training_requirement_templates,
-- which needed its own policy because it was a brand-new table — see
-- fix-templates-rls-policy.sql). Column-level grants aren't a thing here;
-- the table's existing policy covers all its columns.
--
-- HOW TO RUN:
-- Supabase dashboard -> SQL Editor -> paste this -> Run.
-- ============================================================

ALTER TABLE ground_school_enrollment
  ADD COLUMN IF NOT EXISTS dgca_roll_number text;

COMMENT ON COLUMN ground_school_enrollment.dgca_roll_number IS
  'The student''s DGCA roll number for this subject''s exam. Required by the app when recording a PASS (Direct Exam Entry on Ground School -> Progress, or the attendance page''s exam editor) — nullable here since rows exist in pre-exam states (PENDING, etc.) where it doesn''t apply yet.';

-- Verify: should show the new column.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ground_school_enrollment'
ORDER BY ordinal_position;
