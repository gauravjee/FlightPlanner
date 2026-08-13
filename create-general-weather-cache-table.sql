-- create-general-weather-cache-table.sql
-- ============================================================
-- Companion step for the "general weather DB cache" patch.
--
-- WHY THIS IS NEEDED:
-- The lat/long "general weather" fallback (for airstrips with no ICAO
-- code) calls Open-Meteo's free API, which has a daily call-volume limit.
-- Without a shared cache, every browser tab/session/user independently
-- polls Open-Meteo on its own schedule, multiplying calls with no upper
-- bound as more people use the app.
--
-- WHAT THIS SCRIPT DOES:
-- Creates a `general_weather_cache` table with one row per configured
-- lat/long location. Before calling Open-Meteo, the app checks this table
-- first — if a row exists and is less than 15 minutes old, it's reused
-- instead of making a new API call. Only when the cached row is missing or
-- stale does the app call Open-Meteo again, then writes the fresh reading
-- back here for the next reader (any tab, any session, any user) to reuse.
--
-- This table holds no personal or sensitive data — just weather readings
-- keyed by coordinates — so it's intentionally left without Row Level
-- Security, the same way `fto_settings` already works in this app. Every
-- request (from the app's anon key) can read and write it.
--
-- HOW TO RUN:
-- Supabase dashboard → SQL Editor → paste this → Run.
-- ============================================================

create table if not exists general_weather_cache (
  id bigint generated always as identity primary key,
  cache_key text not null unique,       -- "lat,lon", rounded to 4 decimal places (~11m)
  temperature numeric not null,          -- Celsius
  dewpoint numeric not null,             -- Celsius
  wind_direction numeric not null,       -- Degrees
  wind_speed numeric not null,           -- Knots
  pressure numeric not null,             -- hPa (surface pressure)
  cloud_cover numeric not null,          -- Percent
  condition_text text not null,          -- e.g. "Partly cloudy"
  observed_at timestamptz not null,      -- Time Open-Meteo reported for this reading
  fetched_at timestamptz not null default now()  -- When THIS app last called Open-Meteo for it
);

-- Every cache lookup filters by cache_key; the unique constraint above
-- already creates a supporting index, but this is explicit for clarity.
create index if not exists idx_general_weather_cache_key on general_weather_cache (cache_key);
