// lib/weather.ts
// Real-time aviation weather service using FAA Aviation Weather Center API
// Completely FREE - no API key required!
// Fetches METAR and TAF for any ICAO airport code

import { WeatherData } from '@/types';

// Cache weather data to avoid excessive API calls
const weatherCache: Map<string, { data: WeatherData; timestamp: number }> = new Map();
const CACHE_DURATION = 29 * 60 * 1000; // 29 minutes

/**
 * Fetch live weather data from aviationweather.gov
 * Completely free, no API key needed
 * Falls back to mock data if API fails
 * 
 * @param station - ICAO airport code (e.g., 'VOBL' for Bangalore)
 * @returns WeatherData object with METAR, TAF, and parsed parameters
 */
export async function fetchWeather(station: string = 'VOBL'): Promise<WeatherData> {
  
  // Check cache first
  const cached = weatherCache.get(station);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    console.log('📡 Using cached weather for', station);
    return cached.data;
  }

  try {
    console.log('🌤️ Fetching live weather for', station, 'from aviationweather.gov');
    
    // Fetch METAR and TAF from FAA Aviation Weather Center
    // Format: https://aviationweather.gov/api/data/metar?ids=VOBL
    const [metarRes, tafRes] = await Promise.all([
      fetch(`https://aviationweather.gov/api/data/metar?ids=${station}&format=json`),
      fetch(`https://aviationweather.gov/api/data/taf?ids=${station}&format=json`),
    ]);

    if (!metarRes.ok) {
      console.warn('⚠️ AviationWeather API error. Using mock data.');
      return getMockWeather(station);
    }

    const metarData = await metarRes.json();
    const tafData = tafRes.ok ? await tafRes.json() : null;

    // Parse the METAR data
    const metar = metarData[0] || {};
    
    console.log('✅ Live weather fetched successfully from FAA!');

    const weather: WeatherData = {
      metar: metar.rawOb || 'METAR unavailable',
      taf: tafData?.[0]?.rawOb || 'TAF unavailable',
      temperature: metar.temp || 0,
      dewpoint: metar.dewp || 0,
      windDirection: metar.wdir || 0,
      windSpeed: metar.wspd || 0,
      visibility: metar.visib ? metar.visib * 1609.34 : 9999, // Convert miles to meters
      ceiling: getCeiling(metar.clouds),
      qnh: metar.altim || 1013,
      altimeter: metar.altim || 29.92,
      flightRules: metar.fltcat || 'VFR',
      warnings: getWarnings(metar, tafData?.[0]),
      time: metar.obsTime || new Date().toISOString(),
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

/**
 * Extract ceiling from cloud layers
 * AviationWeather API provides clouds as array of { cover, base }
 */
function getCeiling(clouds: any): number {
  if (!clouds || !Array.isArray(clouds) || clouds.length === 0) return 99999;
  
  const ceilingClouds = clouds.filter((c: any) => 
    c.cover === 'BKN' || c.cover === 'OVC' || c.cover === 'OVX'
  );
  
  if (ceilingClouds.length === 0) return 99999;
  
  // Find the lowest ceiling
  const bases = ceilingClouds
    .map((c: any) => c.base * 100) // Convert hundreds of feet to feet
    .filter((b: number) => b > 0);
  
  return bases.length > 0 ? Math.min(...bases) : 99999;
}

/**
 * Generate weather warnings based on conditions
 */
function getWarnings(metar: any, taf: any): string[] {
  const warnings: string[] = [];
  
  // Visibility warnings
  const visMeters = metar.visib ? metar.visib * 1609.34 : 99999;
  if (visMeters < 5000) warnings.push('⚠️ Reduced visibility');
  if (visMeters < 1500) warnings.push('🔴 Low visibility operations');
  
  // Wind warnings
  if (metar.wspd > 20) warnings.push('💨 Strong winds');
  if (metar.wspd > 30) warnings.push('🔴 High winds - Caution advised');
  
  // Flight rules warning
  if (metar.fltcat === 'IFR') warnings.push('🔴 IFR Conditions');
  if (metar.fltcat === 'LIFR') warnings.push('🔴 Low IFR - VFR not permitted');
  if (metar.fltcat === 'MVFR') warnings.push('🟡 Marginal VFR');
  
  // Thunderstorm check
  if (metar.rawOb?.includes('TS') || metar.rawOb?.includes('CB')) {
    warnings.push('⛈️ Thunderstorm in vicinity');
  }
  
  return warnings;
}

/**
 * Mock weather data for fallback
 */
function getMockWeather(station: string): WeatherData {
  return {
    metar: `${station} N/A - Unable to fetch weather`,
    taf: 'TAF unavailable',
    temperature: 0, dewpoint: 0,
    windDirection: 0, windSpeed: 0,
    visibility: 0, ceiling: 99999,
    qnh: 1013, altimeter: 29.92,
    flightRules: 'VFR',
    warnings: ['⚠️ Using mock data - Check internet connection'],
    time: new Date().toISOString(),
    station: station,
    isLoading: false,
    error: 'Failed to fetch from API',
  };
}

/**
 * Calculate milliseconds until next METAR issuance
 * METAR is typically issued at :20 and :50 past each hour
 */
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