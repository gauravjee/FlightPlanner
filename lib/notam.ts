// lib/notam.ts
// Client-side fetch for NOTAMs. The real work — calling SkyLink, mapping its
// fields to this app's NOTAM shape, and caching the result — happens in
// app/api/notam/route.ts, so this file is just a typed fetch with honest
// error behaviour.
import { NOTAM } from '@/types';

/**
 * Fetch NOTAMs for an airport via our proxy API.
 *
 * THROWS on failure — deliberately, changed 2026-09-05. This used to catch
 * everything and return [], which meant a dead service was indistinguishable
 * from "this airport genuinely has no NOTAMs": the Dashboard tile rendered
 * "No active NOTAMs for VOBL" while the proxy was returning 500 for every
 * request. A confidently wrong all-clear on a safety-adjacent panel is worse
 * than saying nothing.
 *
 * SWR is the only caller (lib/hooks/useWeather.ts) and is built to receive a
 * throw: it surfaces it as `error`, which the tile uses to say "NOTAM service
 * unavailable" instead of inventing an all-clear.
 */
export async function fetchNOTAMs(airportCode: string = 'VOBL'): Promise<NOTAM[]> {
  try {
    console.log('🛫 Fetching NOTAMs for', airportCode);
    const res = await fetch(`/api/notam?station=${encodeURIComponent(airportCode)}`);

    if (!res.ok) {
      throw new Error(`NOTAM service returned ${res.status}`);
    }

    const data = await res.json();

    if (!Array.isArray(data)) {
      throw new Error('NOTAM service returned an unexpected response shape');
    }

    return data as NOTAM[];
  } catch (error) {
    // Log, then re-throw so SWR can distinguish failure from emptiness.
    console.error('❌ Error fetching NOTAMs:', error);
    throw error;
  }
}
