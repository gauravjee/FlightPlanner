-- add-notam-cache-table.sql
-- ============================================================
-- Companion step for the SkyLink NOTAM integration.
--
-- WHY THIS IS NEEDED:
-- NOTAMs now come from the SkyLink API (RapidAPI), whose free tier allows
-- 1,000 requests/month. Without a shared cache, every browser tab and every
-- flight-detail modal would poll independently: a single dashboard left open
-- with a 30-minute refresh is ~1,440 requests/month on its own — over the
-- limit before a second user logs in.
--
-- WHAT THIS SCRIPT DOES:
-- Creates a `notam_cache` table with one row per station. The /api/notam
-- route checks this table first — if the row is newer than the configured
-- TTL (fto_settings key `notam_cache_ttl_hours`, default 2), it is reused
-- and NO upstream call is made. Only a missing or stale row triggers a real
-- SkyLink request, whose result is then written back for every other
-- reader (any tab, any session, any user).
--
-- At a 2-hour TTL that is ~360 upstream calls/month per station, comfortably
-- inside the free tier with room for a second station.
--
-- No clearing job is needed: one row per station, upserted in place, with
-- freshness decided by comparing fetched_at on read. Stale rows are simply
-- overwritten — the same design general_weather_cache already uses.
--
-- The NOTAMs themselves are public aeronautical information — no personal or
-- sensitive data — so this table is intentionally left without Row Level
-- Security, matching general_weather_cache and fto_settings in this app.
--
-- HOW TO RUN:
-- Supabase dashboard → SQL Editor → paste this → Run.
-- ============================================================

create table if not exists notam_cache (
  id bigint generated always as identity primary key,
  cache_key text not null unique,                 -- ICAO station code, uppercased (e.g. 'VOBL')
  notams jsonb not null,                          -- the mapped NOTAM[] exactly as the app consumes it
  total_count integer not null default 0,         -- what the upstream reported, for sanity checks
  fetched_at timestamptz not null default now()   -- when THIS app last called SkyLink for it
);

create index if not exists idx_notam_cache_key on notam_cache (cache_key);

comment on table notam_cache is
  'Shared cache for SkyLink NOTAM responses. TTL is configurable via the fto_settings key notam_cache_ttl_hours (default 2). One row per ICAO station, upserted in place; no clearing job required.';
