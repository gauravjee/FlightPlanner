-- duration-months.sql
-- Plan vs actual (19 Oct): a planned course length per training program. The Progress page
-- spreads the program's Total Hours target evenly over it from the student's current course start.
--
-- ADDITIVE ONLY: one new nullable column; existing programs get null (= no plan shown).
-- Reversible (with approval, as it deletes the new column's values):
--   alter table public.training_programs drop column duration_months;

alter table public.training_programs
  add column duration_months integer
    constraint training_programs_duration_months_positive check (duration_months is null or duration_months > 0);

-- Check (read-only)
select program_code, required_hours, duration_months from public.training_programs order by sort_order;
