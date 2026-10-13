-- add-student-master.sql (2026-10-13) — B3/B4 step S1, see claude/student-master-design-2026-10-13.md
-- ADDITIVE ONLY: new nullable columns, a status check (all rows are ACTIVE), two new tables, and new rows in the new course table.
alter table public.students
  add column address text,
  add column nationality text,
  add column emergency_contact_name text,
  add column emergency_contact_relation text,
  add column emergency_contact_phone text,
  add column blood_group text constraint students_blood_group_check check (blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  add column id_documents_enc text,
  add column status_changed_at timestamptz,
  add column status_changed_by uuid,
  add column status_reason text;
alter table public.students add constraint students_status_check check (status in ('ACTIVE','SUSPENDED','GRADUATED','LEFT'));

create table public.student_courses (
  id bigint generated always as identity primary key,
  student_id uuid not null constraint student_courses_student_fk references public.students(id) on delete cascade,
  program_id bigint not null constraint student_courses_program_fk references public.training_programs(id) on delete restrict,
  start_date date not null,
  end_date date,
  outcome text not null default 'IN_PROGRESS' constraint student_courses_outcome_check check (outcome in ('IN_PROGRESS','COMPLETED','DISCONTINUED')),
  note text,
  created_at timestamptz not null default now(),
  constraint student_courses_dates check (end_date is null or end_date >= start_date),
  constraint student_courses_end_rule check ((outcome = 'IN_PROGRESS') = (end_date is null))
);
create unique index student_courses_one_current on public.student_courses(student_id) where outcome = 'IN_PROGRESS';
alter table public.student_courses enable row level security;

create table public.student_document_views (
  id bigint generated always as identity primary key,
  student_id uuid not null constraint student_document_views_student_fk references public.students(id) on delete restrict,
  viewed_by uuid not null,
  viewed_at timestamptz not null default now(),
  action text not null default 'VIEW' constraint student_document_views_action_check check (action in ('VIEW','ADD','EDIT')),
  actor_role text
);
alter table public.student_document_views enable row level security;

insert into public.student_courses (student_id, program_id, start_date)
select s.id, p.id, s.joined_date::date
from public.students s
join public.training_programs p on p.program_code = s.training_stage
where s.joined_date::text ~ '^\d{4}-\d{2}-\d{2}$'
  and not exists (select 1 from public.student_courses c where c.student_id = s.id);
