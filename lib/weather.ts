// lib/weather.ts
// Real-time aviation weather via FAA Aviation Weather Center
// Uses Next.js API route to avoid CORS issues

import { WeatherData } from '@/types';

const weatherCache: Map<string, { data: WeatherData; timestamp: number }> = new Map();
const CACHE_DURATION = 29 * 60 * 1000; // 29 minutes

export async function fetchWeather(station: string = 'VOBL'): Promise<WeatherData> {
  // Check cache first
  const cached = weatherCache.get(station);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    console.log('📡 Using cached weather for', station);
    return cached.data;
  }

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
      taf: taf?.rawOb || 'TAF not available for this station',
      temperature: metar.temp || 0,
      dewpoint: metar.dewp || 0,
      windDirection: metar.wdir || 0,
      windSpeed: metar.wspd || 0,
      visibility: metar.visib ? Math.round(metar.visib * 1609.34) : 9999,
      ceiling: getCeiling(metar.clouds),
      qnh: metar.altim || 1013,
      altimeter: metar.altim || 29.92,
      flightRules: metar.fltcat || 'VFR',
      warnings: getWarnings(metar, taf),
      time: metar.obsTime || new Date().toISOString(),
      station: station,
      isLoading: false,
      error: null,
    };

    weatherCache.set(station, { data: weather, timestamp: Date.now() });
    return weather;
  } catch (error) {
    console.error('❌ Weather API error:', error);
    return getMockWeather(station);
  }
}

function getCeiling(clouds: any): number {
  if (!clouds || !Array.isArray(clouds) || clouds.length === 0) return 99999;
  const ceilingClouds = clouds.filter((c: any) => c.cover === 'BKN' || c.cover === 'OVC' || c.cover === 'OVX');
  if (ceilingClouds.length === 0) return 99999;
  const bases = ceilingClouds.map((c: any) => c.base * 100).filter((b: number) => b > 0);
  return bases.length > 0 ? Math.min(...bases) : 99999;
}

function getWarnings(metar: any, taf: any): string[] {
  const warnings: string[] = [];
  const visMeters = metar.visib ? metar.visib * 1609.34 : 99999;
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