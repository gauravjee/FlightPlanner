-- convert-student-dates.sql (2026-10-13) — B3 step S2. CHANGES STORED DATA: needs the operator's explicit approval.
-- students.joined_date / date_of_birth / medical_expiry: text -> date. '' becomes NULL; 'YYYY-MM-DD' keeps its value.
-- Checked 13 Oct: 5 students; joined 5 valid; date_of_birth 2 valid + 3 empty; medical_expiry 2 valid + 3 empty.
alter table public.students
  alter column joined_date drop default,
  alter column joined_date type date using nullif(joined_date, '')::date,
  alter column date_of_birth drop default,
  alter column date_of_birth type date using nullif(date_of_birth, '')::date,
  alter column medical_expiry drop default,
  alter column medical_expiry type date using nullif(medical_expiry, '')::date;
