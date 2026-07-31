// lib/weather.ts
// Real-time aviation weather service using AVWX API
// Fetches METAR and TAF for a given ICAO airport code

import { WeatherData } from '@/types';

// Cache weather data to avoid exceeding API rate limits
const weatherCache: Map<string, { data: WeatherData; timestamp: number }> = new Map();
// const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const CACHE_DURATION = 29 * 60 * 1000; // 29 minutes - just before next METAR

/**
 * Fetch live weather data from AVWX API
 * Uses caching to reduce API calls (5-minute cache)
 * Falls back to mock data if API fails
 */
export async function fetchWeather(station: string = 'VOBL'): Promise<WeatherData> {
  
  // Check cache first
  const cached = weatherCache.get(station);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    console.log('📡 Using cached weather for', station);
    return cached.data;
  }

  const apiKey = process.env.NEXT_PUBLIC_AVWX_API_KEY;
  
  // If no API key, use mock data
  if (!apiKey || apiKey.includes('your-avwx-api-key')) {
    console.warn('⚠️ No AVWX API key found. Using mock weather data.');
    return getMockWeather(station);
  }

  try {
    console.log('🌤️ Fetching live weather for', station);
    
    // Fetch METAR and TAF in parallel
    const [metarRes, tafRes] = await Promise.all([
      fetch(`https://avwx.rest/api/metar/${station}`, {
        headers: { 'Authorization': `BEARER ${apiKey}` },
      }),
      fetch(`https://avwx.rest/api/taf/${station}`, {
        headers: { 'Authorization': `BEARER ${apiKey}` },
      }),
    ]);

    if (!metarRes.ok) {
      console.warn('⚠️ AVWX API error:', metarRes.status);
      return getMockWeather(station);
    }

    const metarData = await metarRes.json();
    const tafData = tafRes.ok ? await tafRes.json() : null;

    console.log('✅ Live weather fetched successfully!');

    const weather: WeatherData = {
      metar: metarData.raw || 'METAR unavailable',
      taf: tafData?.raw || 'TAF unavailable',
      temperature: metarData.temperature?.value || 0,
      dewpoint: metarData.dewpoint?.value || 0,
      windDirection: metarData.wind_direction?.value || 0,
      windSpeed: metarData.wind_speed?.value || 0,
      visibility: metarData.visibility?.value || 9999,
      ceiling: getCeiling(metarData.clouds),
      qnh: metarData.altimeter?.value || 1013,
      altimeter: metarData.altimeter?.value || 29.92,
      flightRules: metarData.flight_rules || 'VFR',
      warnings: getWarnings(metarData, tafData),
      time: metarData.time?.dt || new Date().toISOString(),
      station: station,
      isLoading: false,
      error: null,
    };

    // Save to cache
    weatherCache.set(station, { data: weather, timestamp: Date.now() });
    
    return weather;
    
  } catch (error) {
    console.error('❌ Weather API error:', error);
    return getMockWeather(station);
  }
}

function getCeiling(clouds: Array<{ code: string; altitude: number }> | undefined): number {
  if (!clouds || clouds.length === 0) return 99999;
  const ceilingClouds = clouds.filter(c => c.code === 'BKN' || c.code === 'OVC');
  if (ceilingClouds.length === 0) return 99999;
  return Math.min(...ceilingClouds.map(c => c.altitude * 100));
}

function getWarnings(metarData: Record<string, unknown>, tafData: Record<string, unknown> | null): string[] {
  const warnings: string[] = [];
  const vis = metarData.visibility?.value as number;
  if (vis && vis < 5000) warnings.push('⚠️ Reduced visibility');
  if (vis && vis < 1500) warnings.push('🔴 Low visibility');
  const windSpeed = metarData.wind_speed?.value as number;
  if (windSpeed && windSpeed > 20) warnings.push('💨 Strong winds');
  const flightRules = metarData.flight_rules as string;
  if (flightRules === 'IFR') warnings.push('🔴 IFR Conditions');
  if (flightRules === 'LIFR') warnings.push('🔴 Low IFR');
  if (flightRules === 'MVFR') warnings.push('🟡 Marginal VFR');
  const tafRaw = tafData?.raw as string;
  if (tafRaw && (tafRaw.includes('TS') || tafRaw.includes('CB'))) {
    warnings.push('⛈️ Thunderstorm risk');
  }
  return warnings;
}

function getMockWeather(station: string): WeatherData {
  return {
    metar: `${station} N/A - API key not configured`,
    taf: 'TAF unavailable - Add AVWX API key to .env.local',
    temperature: 0, dewpoint: 0,
    windDirection: 0, windSpeed: 0,
    visibility: 0, ceiling: 0,
    qnh: 0, altimeter: 0,
    flightRules: 'N/A',
    warnings: ['⚠️ Using mock data - API key not configured'],
    time: new Date().toISOString(),
    station: station,
    isLoading: false,
    error: 'API key not configured',
  };
}
/**
 * Calculate milliseconds until next METAR issuance time
 * METAR is typically issued at :20 and :50 past each hour UTC
 * Returns milliseconds to wait until next issuance
 */
export function getTimeUntilNextMetar(): number {
  const now = new Date();
  const utcMinutes = now.getUTCMinutes();
  const utcSeconds = now.getUTCSeconds();
  
  // Next issuance times: :20 and :50 past the hour
  const issuanceMinutes = [20, 50];
  
  // Find the next issuance minute
  let nextMinute = issuanceMinutes.find(m => m > utcMinutes);
  if (nextMinute === undefined) {
    // Past :50, next is :20 of next hour
    nextMinute = issuanceMinutes[0];
    const minutesUntil = (60 - utcMinutes) + nextMinute;
    return (minutesUntil * 60 - utcSeconds) * 1000;
  }
  
  const minutesUntil = nextMinute - utcMinutes;
  return (minutesUntil * 60 - utcSeconds) * 1000;
}