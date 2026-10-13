-- check-person-links.sql (2026-10-14) — READ-ONLY. Run before add-person-links.sql; every row should say ok.
select 'availability' as tbl, a.id::text, a.person_type, a.person_id,
  case
    when a.person_type = 'instructor' and a.person_id ~ '^\d+$' and exists (select 1 from public.instructors i where i.id = a.person_id::bigint) then 'ok'
    when a.person_type = 'student' and exists (select 1 from public.students s where s.id::text = a.person_id) then 'ok'
    else 'PROBLEM'
  end as result
from public.availability a
union all
select 'ba_tests', b.id::text, b.person_type, b.person_id,
  case
    when coalesce(b.person_id, '') = '' and b.person_type in ('INSTRUCTOR', 'STUDENT') then 'ok (no profile)'
    when b.person_type = 'INSTRUCTOR' and b.person_id ~ '^\d+$' and exists (select 1 from public.instructors i where i.id = b.person_id::bigint) then 'ok'
    when b.person_type = 'STUDENT' and exists (select 1 from public.students s where s.id::text = b.person_id) then 'ok'
    else 'PROBLEM'
  end
from public.ba_tests b
order by 1, 2;
