// lib/weather.ts
// Real-time aviation weather via FAA Aviation Weather Center
// Uses Next.js API route to avoid CORS issues

import { WeatherData, GeneralWeatherData } from '@/types';
import { supabase } from './supabase';

// No in-tab cache here. SWR (lib/hooks/useWeather.ts) already dedupes and
// caches per tab, and the module-level Maps that used to sit here silently
// swallowed the Dashboard's "Refresh Weather" press: mutate() re-ran the
// fetcher, the fetcher returned the same cached object, and the user saw a
// spinner with nothing changing. Quota protection that actually matters is
// the shared `general_weather_cache` DB table below.

export async function fetchWeather(station: string = 'VOBL'): Promise<WeatherData> {
  try {
    console.log('🌤️ Fetching live weather for', station);
    const res = await fetch(`/api/weather?station=${station}`);
    const { metar, taf } = await res.json();

    if (!metar) {
      console.warn('⚠️ No METAR data. Using mock.');
      return getMockWeather(station);
    }

    console.log('✅ Live weather received!');
    const weather: WeatherData = {
      metar: metar.rawOb || 'METAR unavailable',
      taf: taf?.rawTAF || 'TAF not available for this station',
      temperature: metar.temp || 0,
      dewpoint: metar.dewp || 0,
      windDirection: metar.wdir || 0,
      windSpeed: metar.wspd || 0,
      visibility: visibilityMeters(metar.visib) ?? 9999,
      ceiling: getCeiling(metar.clouds),
      qnh: metar.altim || 1013,
      altimeter: metar.altim || 29.92,
      flightRules: metar.fltcat || 'VFR',
      warnings: getWarnings(metar),
      time: metar.obsTime || new Date().toISOString(),
      station: station,
      isLoading: false,
      error: null,
    };

    return weather;
  } catch (error) {
    console.error('❌ Weather API error:', error);
    return getMockWeather(station);
  }
}

// Shape of a single cloud layer entry in the FAA METAR response's `clouds`
// array — only the fields read below.
interface MetarCloudLayer {
  cover?: string;
  base: number;
}

// Shape of the FAA METAR response object — only the fields read across
// fetchWeather/getCeiling/getWarnings below.
interface MetarData {
  rawOb?: string;
  temp?: number;
  dewp?: number;
  wdir?: number;
  wspd: number;
  visib?: number | string;   // NOAA sends a number OR a string like "6+" / "10+"
  clouds?: MetarCloudLayer[];
  altim?: number;
  fltcat?: string;
  obsTime?: string;
}

// NOAA's METAR API returns `visib` as a number for most stations but as a
// string like "6+" or "10+" (statute miles, "at least N") for others —
// VOBL is one of them. `"6+" * 1609.34` is NaN, and NaN is silently
// truthy-guarded past `metar.visib ? ... : default`, which used to leave
// visibility rendering as "NaNm" AND — the real problem — killed the
// reduced/low-visibility warnings below, since every `NaN < threshold`
// comparison is false. Parse both shapes here, in one place, so the two
// call sites can't drift.
//
// ponytail: "6+" is treated as exactly 6 SM (a floor, not the real value —
// the raw METAR for that obs actually reports 9999m/10km+). Conservative in
// the safe direction for a warning threshold. Upgrade to a proper "at
// least" bound if a station's exact visibility ever needs displaying.
function visibilityMeters(visib: number | string | undefined): number | null {
  const sm = typeof visib === 'number' ? visib : parseFloat(visib ?? '');
  return Number.isFinite(sm) ? Math.round(sm * 1609.34) : null;
}

function getCeiling(clouds: MetarCloudLayer[] | undefined): number {
  if (!clouds || !Array.isArray(clouds) || clouds.length === 0) return 99999;
  const ceilingClouds = clouds.filter((c: MetarCloudLayer) => c.cover === 'BKN' || c.cover === 'OVC' || c.cover === 'OVX');
  if (ceilingClouds.length === 0) return 99999;
  const bases = ceilingClouds.map((c: MetarCloudLayer) => c.base * 100).filter((b: number) => b > 0);
  return bases.length > 0 ? Math.min(...bases) : 99999;
}

function getWarnings(metar: MetarData): string[] {
  const warnings: string[] = [];
  const visMeters = visibilityMeters(metar.visib) ?? 99999;
  if (visMeters < 5000) warnings.push('⚠️ Reduced visibility');
  if (visMeters < 1500) warnings.push('🔴 Low visibility');
  if (metar.wspd > 20) warnings.push('💨 Strong winds');
  if (metar.wspd > 30) warnings.push('🔴 High winds');
  if (metar.fltcat === 'IFR') warnings.push('🔴 IFR Conditions');
  if (metar.fltcat === 'LIFR') warnings.push('🔴 Low IFR');
  if (metar.fltcat === 'MVFR') warnings.push('🟡 Marginal VFR');
  if (metar.rawOb?.includes('TS') || metar.rawOb?.includes('CB')) warnings.push('⛈️ Thunderstorm risk');
  return warnings;
}

function getMockWeather(station: string): WeatherData {
  return {
    metar: `${station} N/A - Unable to fetch weather`,
    taf: 'TAF unavailable',
    temperature: 0, dewpoint: 0,
    windDirection: 0, windSpeed: 0,
    visibility: 0, ceiling: 99999,
    qnh: 1013, altimeter: 29.92,
    flightRules: 'VFR',
    warnings: ['⚠️ Using mock data'],
    time: new Date().toISOString(),
    station: station,
    isLoading: false,
    error: 'Failed to fetch',
  };
}

export function getTimeUntilNextMetar(): number {
  const now = new Date();
  const utcMinutes = now.getUTCMinutes();
  const utcSeconds = now.getUTCSeconds();
  const issuanceMinutes = [20, 50];
  let nextMinute = issuanceMinutes.find(m => m > utcMinutes);
  if (nextMinute === undefined) {
    nextMinute = issuanceMinutes[0];
    const minutesUntil = (60 - utcMinutes) + nextMinute;
    return (minutesUntil * 60 - utcSeconds) * 1000;
  }
  const minutesUntil = nextMinute - utcMinutes;
  return (minutesUntil * 60 - utcSeconds) * 1000;
}

// ============================================================
// GENERAL (NON-AVIATION) WEATHER — for airstrips with no ICAO/reference
// station configured. Sourced from Open-Meteo (free, no API key, CORS-
// enabled for browser use) by latitude/longitude instead of a station
// code. This is NOT aviation weather: there's no METAR/TAF format and no
// official VFR/MVFR/IFR flight-category rating for an arbitrary
// coordinate — see the GeneralWeatherData type and the "not official
// aviation weather" label shown alongside it in the dashboard UI.
// ============================================================

// WMO weather codes, as used by Open-Meteo's `weather_code` field.
// https://open-meteo.com/en/docs — abbreviated to the common cases.
const WMO_WEATHER_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

function describeWeatherCode(code: number): string {
  return WMO_WEATHER_CODES[code] || 'Conditions unavailable';
}

function getMockGeneralWeather(error: string): GeneralWeatherData {
  return {
    temperature: 0,
    dewpoint: 0,
    windDirection: 0,
    windSpeed: 0,
    pressure: 1013,
    cloudCover: 0,
    conditionText: 'Weather unavailable',
    time: new Date().toISOString(),
    isLoading: false,
    error,
  };
}

// How fresh a reading in the shared `general_weather_cache` DB table has to
// be before we'll reuse it instead of calling Open-Meteo again. Open-Meteo's free tier has a daily call limit;
// sharing one DB-cached reading across every tab/session/user (instead of
// each firing its own request) is what actually keeps usage under it.
const GENERAL_WEATHER_FRESHNESS_MS = 15 * 60 * 1000; // 15 minutes

// Coordinates are rounded to 4 decimal places (~11m) for the cache key so
// trivial float differences (e.g. re-parsing the same Settings value) don't
// fragment the cache into near-duplicate rows.
function generalWeatherCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

function rowToGeneralWeather(row: Record<string, unknown>): GeneralWeatherData {
  return {
    temperature: row.temperature as number,
    dewpoint: row.dewpoint as number,
    windDirection: row.wind_direction as number,
    windSpeed: row.wind_speed as number,
    pressure: row.pressure as number,
    cloudCover: row.cloud_cover as number,
    conditionText: row.condition_text as string,
    time: row.observed_at as string,
    isLoading: false,
    error: null,
  };
}

/**
 * Fetch general (non-aviation) weather for a lat/long, for schools whose
 * field has no ICAO code and no nearby reference station configured.
 *
 * Two layers, cheapest first:
 *   1. Shared `general_weather_cache` DB table — avoids calling Open-Meteo
 *      again if ANY tab/session/user already fetched this location within
 *      the last 15 minutes. This is what actually protects Open-Meteo's
 *      rate limit, since aviation weather traffic isn't confined to one
 *      browser.
 *   2. Open-Meteo itself, only on a genuine cache miss/staleness — result is
 *      written back to the DB cache for the next reader.
 */
export async function fetchGeneralWeather(lat: number, lon: number): Promise<GeneralWeatherData> {
  const cacheKey = generalWeatherCacheKey(lat, lon);

  // Shared DB cache — read before hitting Open-Meteo. A read failure (e.g.
  // the migration hasn't been run yet) is not fatal: fall through and fetch
  // live rather than blocking the weather widget on the cache table existing.
  try {
    const { data: row, error: readError } = await supabase
      .from('general_weather_cache')
      .select('*')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (!readError && row) {
      const fetchedAt = new Date(row.fetched_at as string).getTime();
      if (Date.now() - fetchedAt < GENERAL_WEATHER_FRESHNESS_MS) {
        const weather = rowToGeneralWeather(row as Record<string, unknown>);
        console.log('📡 Using DB-cached general weather for', cacheKey);
        return weather;
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
      return getMockGeneralWeather('Failed to fetch');
    }
    const json = await res.json();
    const current = json?.current;
    if (!current) {
      console.warn('⚠️ No current weather in Open-Meteo response. Using mock.');
      return getMockGeneralWeather('Failed to fetch');
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

    // Best-effort write-back to the shared cache so the next reader (this
    // tab or any other) can skip Open-Meteo entirely. Fire-and-forget: a
    // failed cache write shouldn't fail the weather fetch that's already
    // succeeded.
    supabase
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
      )
      .then(({ error: writeError }) => {
        if (writeError) {
          console.warn('⚠️ Failed to write general_weather_cache:', writeError.message);
        }
      });

    return weather;
  } catch (error) {
    console.error('❌ General weather API error:', error);
    return getMockGeneralWeather('Failed to fetch');
  }
}