// app/api/weather/general/route.ts
// Server-side cache + live fetch for general (non-aviation) weather, by
// lat/long — for airstrips with no ICAO/reference station configured.
// Sourced from Open-Meteo (free, no API key, but rate-limited).
//
// 2026-09-18 (RLS remediation, Batch 5): moved here from a direct
// client-side `supabase.from('general_weather_cache')` read/upsert in
// lib/weather.ts — that table had RLS disabled entirely, so the anon key
// could read or write any row. This route does the identical two-layer
// cache logic (DB cache, then Open-Meteo on a miss/staleness) with the
// service-role key instead. Session-gated only (requireSession()), same as
// /api/notam and /api/weather — general weather isn't per-person data, so
// no role should be excluded.
//
// The cache write-back is AWAITED, not fire-and-forget (the old client
// code was fire-and-forget, which is fine in a browser tab that stays
// alive). See app/api/notam/route.ts's note on why that matters
// server-side: a serverless function can be frozen the instant it returns
// a response, so an in-flight promise may never complete on Vercel.

import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  GENERAL_WEATHER_FRESHNESS_MS,
  generalWeatherCacheKey,
  rowToGeneralWeather,
  describeWeatherCode,
  getMockGeneralWeather,
} from '@/lib/weather';
import type { GeneralWeatherData } from '@/types';

export async function GET(request: Request) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get('lat'));
  const lon = Number(searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: 'lat and lon are required.' }, { status: 400 });
  }

  const cacheKey = generalWeatherCacheKey(lat, lon);

  // Shared DB cache — read before hitting Open-Meteo. A read failure is not
  // fatal: fall through and fetch live rather than blocking the weather
  // widget on the cache table existing.
  try {
    const { data: row, error: readError } = await supabaseAdmin
      .from('general_weather_cache')
      .select('*')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (!readError && row) {
      const fetchedAt = new Date(row.fetched_at as string).getTime();
      if (Date.now() - fetchedAt < GENERAL_WEATHER_FRESHNESS_MS) {
        console.log('📡 Using DB-cached general weather for', cacheKey);
        return NextResponse.json(rowToGeneralWeather(row as Record<string, unknown>));
      }
    }
  } catch (err) {
    console.warn('⚠️ general_weather_cache read failed, fetching live instead:', err);
  }

  try {
    console.log('🌤️ Fetching general weather for', cacheKey);
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: 'temperature_2m,dew_point_2m,wind_speed_10m,wind_direction_10m,surface_pressure,cloud_cover,weather_code',
      wind_speed_unit: 'kn',
      timezone: 'UTC',
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
    if (!res.ok) {
      console.warn('⚠️ Open-Meteo request failed:', res.status);
      return NextResponse.json(getMockGeneralWeather('Failed to fetch'));
    }
    const json = await res.json();
    const current = json?.current;
    if (!current) {
      console.warn('⚠️ No current weather in Open-Meteo response. Using mock.');
      return NextResponse.json(getMockGeneralWeather('Failed to fetch'));
    }

    const observedAt = current.time ? `${current.time}Z` : new Date().toISOString();
    const weather: GeneralWeatherData = {
      temperature: current.temperature_2m ?? 0,
      dewpoint: current.dew_point_2m ?? 0,
      windDirection: current.wind_direction_10m ?? 0,
      windSpeed: current.wind_speed_10m ?? 0,
      pressure: current.surface_pressure ?? 1013,
      cloudCover: current.cloud_cover ?? 0,
      conditionText: describeWeatherCode(current.weather_code),
      time: observedAt,
      isLoading: false,
      error: null,
    };

    console.log('✅ Live general weather received!');

    const { error: cacheError } = await supabaseAdmin
      .from('general_weather_cache')
      .upsert(
        {
          cache_key: cacheKey,
          temperature: weather.temperature,
          dewpoint: weather.dewpoint,
          wind_direction: weather.windDirection,
          wind_speed: weather.windSpeed,
          pressure: weather.pressure,
          cloud_cover: weather.cloudCover,
          condition_text: weather.conditionText,
          observed_at: weather.time,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'cache_key' }
      );
    if (cacheError) {
      console.warn('⚠️ Failed to write general_weather_cache:', cacheError.message);
    }

    return NextResponse.json(weather);
  } catch (error) {
    console.error('❌ General weather API error:', error);
    return NextResponse.json(getMockGeneralWeather('Failed to fetch'));
  }
}
