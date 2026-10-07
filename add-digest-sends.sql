-- add-digest-sends.sql (2026-10-07)
-- ADDITIVE ONLY: one new table. No existing data is changed. Safe to re-run.
--
-- Remembers which digest emails went out on which day, so the notification
-- job (app/api/cron/check-notifications) can catch up a reminder that a
-- missed cron run would otherwise lose, and never sends the same one twice:
--   'people-digest'                          the admin/operations licence email (once a day)
--   'remind|<email>|<document>|<expiry>'     one person's reminder for one document
create table if not exists public.digest_sends (
  key text not null,
  sent_on date not null,
  created_at timestamptz not null default now(),
  primary key (key, sent_on)
);
-- Same as the other tables: RLS on, no policies — only the server (service role) reads or writes it.
alter table public.digest_sends enable row level security;
