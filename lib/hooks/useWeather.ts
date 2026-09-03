// lib/hooks/useWeather.ts
// ---------------------------------------------------------------------------
// Weather, general (non-aviation) weather, and NOTAMs — the last three
// domains that lived in the Zustand store (lib/store.ts). Moved here
// 2026-09-03 when that store was retired; unlike every earlier SWR stage
// these are live external APIs (FAA / Open-Meteo) rather than Supabase
// tables, so the "key" is just the station or lat/long being asked about.
//
// What this buys over the old store, beyond deleting the store: any
// component can now ask for weather without the Dashboard having fetched
// it first. FlightDetailModal used to read store.weather but never fetched
// it — open a flight from the Schedule Board without visiting the
// Dashboard and its briefing showed the "Loading weather..." placeholder
// forever. Sharing one SWR key fixes that with no extra request: whichever
// mounts first fetches, the rest read the same cache entry.
// ---------------------------------------------------------------------------

'use client';

import useSWR from 'swr';
import { fetchWeather, fetchGeneralWeather, getTimeUntilNextMetar } from '@/lib/weather';
import { fetchNOTAMs } from '@/lib/notam';
import type { WeatherData, GeneralWeatherData, NOTAM } from '@/types';

// The shape every consumer sees before the first fetch resolves — same
// placeholder the store used as its initial state, kept identical so the
// UI's `weather.isLoading` / `weather.metar` reads behave exactly as before.
const LOADING_WEATHER: WeatherData = {
  metar: 'Loading weather...',
  taf: 'Loading forecast...',
  temperature: 0, dewpoint: 0,
  windDirection: 0, windSpeed: 0,
  visibility: 0, ceiling: 0,
  qnh: 0, altimeter: 0,
  flightRules: 'VFR',
  warnings: [],
  time: '', station: 'VOBL',
  isLoading: true, error: null,
};

// METAR is issued at :20 and :50 past each UTC hour. SWR accepts a function
// for refreshInterval, evaluated after every fetch — so returning "time
// until the next issuance" re-aligns the poll to the real schedule each
// time, instead of the old store's fixed 30-minute timer that drifted off
// issuance after the first tick. Floored at 60s so a fetch landing a few
// seconds before an issuance can't spin.
const metarRefreshInterval = () => Math.max(getTimeUntilNextMetar(), 60_000);

export const weatherKey = (station: string) => ['weather', station] as const;
export const generalWeatherKey = (lat: number, lon: number) => ['generalWeather', lat, lon] as const;
export const notamsKey = (station: string) => ['notams', station] as const;

// A station is optional in this app: a school flying from an airstrip with
// no ICAO code leaves it blank, and the UI shows "no live weather" instead.
// SWR's null-key idiom means no request is ever made in that case.
export function useWeather(station: string | undefined, enabled = true) {
  const { data, error, isLoading, mutate } = useSWR(
    enabled && station ? weatherKey(station) : null,
    ([, s]) => fetchWeather(s),
    { refreshInterval: metarRefreshInterval, revalidateOnFocus: false }
  );

  // `refresh` backs the Dashboard's manual refresh button — SWR's own bound
  // revalidate, so a manual press and the scheduled poll share one cache
  // entry and can't race into two different displayed values.
  return { weather: data ?? LOADING_WEATHER, error, isLoading, refresh: () => mutate() };
}

// Only used when there's no ICAO/reference station — real METAR beats a
// general forecast, so callers pass enabled=false once a station exists.
// General forecasts don't follow METAR's :20/:50 issuance, so this keeps
// the plain 30-minute cadence the store used.
export function useGeneralWeather(lat: number, lon: number, enabled = true) {
  const { data, error, isLoading, mutate } = useSWR(
    enabled && Number.isFinite(lat) && Number.isFinite(lon) ? generalWeatherKey(lat, lon) : null,
    ([, la, lo]) => fetchGeneralWeather(la as number, lo as number),
    { refreshInterval: 30 * 60 * 1000, revalidateOnFocus: false }
  );

  return {
    generalWeather: (data ?? null) as GeneralWeatherData | null,
    error,
    isLoading,
    refresh: () => mutate(),
  };
}

export function useNotams(station: string | undefined, enabled = true) {
  const { data, error, isLoading } = useSWR(
    enabled && station ? notamsKey(station) : null,
    ([, s]) => fetchNOTAMs(s),
    { refreshInterval: 30 * 60 * 1000, revalidateOnFocus: false }
  );

  return { notams: (data ?? []) as NOTAM[], loadingNotams: isLoading, error };
}
