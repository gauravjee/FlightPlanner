-- exercise-guidance.sql
-- Small win 2a (19 Oct): briefing notes and an SOP / video link per exercise,
-- shown on the booking form when the exercise is picked.
--
-- ADDITIVE ONLY: two new nullable columns. No existing row or value changes.
-- The check allows only http:// or https:// links (no javascript: etc.).
-- Reversible (with approval, as it deletes the new columns' values):
--   alter table public.exercises drop column briefing_notes, drop column reference_url;

alter table public.exercises
  add column briefing_notes text,
  add column reference_url text
    constraint exercises_reference_url_http check (reference_url is null or reference_url ~* '^https?://\S+$');

-- Check (read-only)
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'exercises' and column_name in ('briefing_notes', 'reference_url');
