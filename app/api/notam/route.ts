// app/api/notam/route.ts
// ============================================================
// NOTAMs via the SkyLink API (RapidAPI), with a shared DB cache.
//
// Built against the official docs at https://skylinkapi.com/docs/v31/notams/
// (NOT the RapidAPI README, which describes a different host, a different
// auth header, and `total_count` instead of `total` — see the timestamp note
// on parseNotamTime below for the difference that actually mattered).
//
// HISTORY: this route used to proxy https://aviationweather.gov/api/data/notam,
// an endpoint that no longer exists — so it returned 500 for every station,
// for every FTO, since it was built. The NOTAM tile has never shown real
// data. Replaced with SkyLink 2026-09-05 (reads the FAA SWIM FNS feed and
// claims worldwide ICAO coverage).
//
// QUOTA IS THE CONSTRAINT, not latency: SkyLink's free tier is 1,000
// requests/month. Every response is therefore cached in `notam_cache`
// (see add-notam-cache-table.sql) and reused until it is older than the
// configured TTL. The cache lives server-side rather than in the browser so
// that every user, tab and flight-detail modal shares one upstream call.
//
// TTL comes from the fto_settings key `notam_cache_ttl_hours` (default 2,
// clamped to 1..24 — see parseNotamTtlHours). At 2 hours that is ~360
// upstream calls/month per station.
//
// NOTAMs are mapped to the app's own NOTAM shape HERE, server-side, so the
// cache stores ready-to-use rows and the client mapper stays trivial.
// ============================================================

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { NOTAM } from '@/types';

const SKYLINK_URL = 'https://data.skylinkapi.com/v3.1/notams';
const DEFAULT_TTL_HOURS = 2;

// Shape of one entry in SkyLink's /v3.1/notams/{icao} response.
interface SkylinkNotam {
  notam_id?: string;
  notam_id_domestic?: string;
  type?: string;
  location?: string;
  effective?: string;      // NOTAM format 'YYYYMMDDHHMM' (UTC) — NOT ISO 8601
  expiration?: string;     // same
  body?: string;
  raw?: string;
  q_code?: string;
  scope?: string;          // 'AERODROME' | 'FIR'
  status?: string;         // 'ACTIVE' | 'FUTURE'
}

/**
 * SkyLink returns NOTAM-format timestamps: '202603241038' = 2026-03-24 10:38 UTC.
 *
 * This app's NOTAM type carries ISO strings, and the UI renders them as
 * dates — so passing the raw value straight through produces an Invalid Date
 * with no error anywhere. Parsed explicitly here, with a null return for
 * anything that doesn't match, so a malformed timestamp degrades to "unknown"
 * rather than to a nonsense date.
 */
export function parseNotamTime(value: string | undefined): string | null {
  if (!value || !/^\d{12}$/.test(value)) return null;
  const [y, mo, d, h, mi] = [
    value.slice(0, 4), value.slice(4, 6), value.slice(6, 8), value.slice(8, 10), value.slice(10, 12),
  ].map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Parse the FTO's configured cache TTL, in hours.
 *
 * Clamped to 1..24 deliberately: this setting spends a metered API quota, so
 * a fat-fingered "0.1" would mean ~7,200 upstream calls/month against a
 * 1,000-request free tier. Same lenient-parse-with-a-floor approach as
 * parseTurnaroundBufferSetting in lib/store.ts — an unusable value falls back
 * to the default rather than throwing.
 */
export function parseNotamTtlHours(raw: string | undefined): number {
  const parsed = parseFloat(raw ?? '');
  if (!Number.isFinite(parsed)) return DEFAULT_TTL_HOURS;
  return Math.min(Math.max(parsed, 1), 24);
}

/** SkyLink's own fields -> this app's NOTAM type. */
function mapSkylinkNotam(n: SkylinkNotam, station: string): NOTAM {
  const body = n.body || n.raw || '';
  return {
    id: n.notam_id || `${station}-${Math.random().toString(36).slice(2)}`,
    notamNumber: n.notam_id_domestic || n.notam_id || 'N/A',
    airportCode: n.location || station,
    text: body,
    // SkyLink exposes no severity field, so derive a coarse one from the
    // body text. Closures and unserviceable equipment are what a briefing
    // most needs to surface; everything else stays MODERATE rather than
    // inventing a precision the source doesn't provide.
    priority: /\bCLSD\b|\bCLOSED\b|\bU\/S\b|\bUNSERVICEABLE\b/i.test(body) ? 'HIGH' : 'MODERATE',
    // scope ('AERODROME' / 'FIR') is more useful on a briefing than the
    // NOTAM record type ('N' = new, 'R' = replace, 'C' = cancel).
    category: n.scope || n.type || 'OTHER',
    // null, not "now": a permanent NOTAM has 'PERM' in place of an
    // expiry timestamp, and defaulting those to the current time made a
    // third of a real VOBL response look already-expired.
    startTime: parseNotamTime(n.effective),
    endTime: parseNotamTime(n.expiration),
    // The API can return future-dated NOTAMs when asked; we don't ask, but
    // honour the flag rather than assuming everything returned is active.
    isActive: n.status !== 'FUTURE',
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const station = (searchParams.get('station') || '').trim().toUpperCase();

  if (!station) {
    return Response.json({ error: 'No station configured.' }, { status: 400 });
  }

  const apiKey = process.env.SKYLINK_API_KEY;
  if (!apiKey) {
    // Explicit and loud rather than a silent empty list — an unconfigured key
    // must not look like "this airport has no NOTAMs". The tile shows
    // "NOTAM service unavailable" for any non-OK response.
    console.warn('⚠️ SKYLINK_API_KEY is not set — NOTAMs cannot be fetched.');
    return Response.json({ error: 'NOTAM service not configured.' }, { status: 503 });
  }

  // ----- 1. TTL from FTO settings -----
  let ttlHours = DEFAULT_TTL_HOURS;
  try {
    const { data: settingRow } = await supabaseAdmin
      .from('fto_settings')
      .select('setting_value')
      .eq('setting_key', 'notam_cache_ttl_hours')
      .maybeSingle();
    ttlHours = parseNotamTtlHours(settingRow?.setting_value as string | undefined);
  } catch {
    // Setting unreadable (table missing, transient error) — the default is
    // safe for the quota, so carry on rather than failing the request.
  }

  // ----- 2. Serve from cache when fresh -----
  try {
    const { data: cached } = await supabaseAdmin
      .from('notam_cache')
      .select('notams, fetched_at')
      .eq('cache_key', station)
      .maybeSingle();

    if (cached?.fetched_at) {
      const ageMs = Date.now() - new Date(cached.fetched_at as string).getTime();
      if (ageMs < ttlHours * 60 * 60 * 1000) {
        console.log(`📋 Serving cached NOTAMs for ${station} (age ${Math.round(ageMs / 60000)}m, TTL ${ttlHours}h)`);
        // x-notam-cache makes quota behaviour verifiable from the client.
        // Latency alone can't distinguish a cache hit from a miss here: a hit
        // still costs two Supabase round trips plus a ~100KB payload, which
        // is the same order as the upstream call it replaces.
        return Response.json(cached.notams, {
          headers: { 'x-notam-cache': 'hit', 'x-notam-cache-age-min': String(Math.round(ageMs / 60000)) },
        });
      }
    }
  } catch (err) {
    // A cache read failure must not block the briefing — fall through and
    // fetch live, exactly as lib/weather.ts does for general_weather_cache.
    console.warn('⚠️ notam_cache read failed, fetching live instead:', err);
  }

  // ----- 3. Fetch live -----
  try {
    console.log('🛫 Fetching live NOTAMs from SkyLink for', station);
    const res = await fetch(`${SKYLINK_URL}/${encodeURIComponent(station)}`, {
      headers: { 'x-api-key': apiKey },
    });

    if (!res.ok) {
      // 429 = monthly quota exhausted (free tier is 1,000 requests/month).
      // Logged distinctly because the fix is a longer TTL or a bigger plan,
      // not a code change — and it would otherwise look like an outage.
      if (res.status === 429) {
        console.error('🚫 SkyLink monthly quota exhausted (429) — raise notam_cache_ttl_hours or upgrade the plan.');
      } else {
        console.warn(`⚠️ SkyLink returned ${res.status} for ${station}`);
      }
      return Response.json({ error: 'Failed to fetch NOTAMs' }, { status: 502 });
    }

    const json = await res.json();
    const raw: SkylinkNotam[] = Array.isArray(json?.notams) ? json.notams : [];
    const notams = raw.map(n => mapSkylinkNotam(n, station));

    // ----- 4. Write back -----
    // AWAITED, deliberately. This was fire-and-forget (matching
    // lib/weather.ts's browser-side write-back) and it silently did nothing
    // on Vercel: a serverless function can be frozen the moment it returns a
    // response, so a promise still in flight never completes. Locally the
    // Node process stays alive, so it worked — which is exactly how this hid.
    // Measured on production: two consecutive requests both took ~2.3s, i.e.
    // both went upstream, burning quota on every single page load.
    //
    // Awaiting costs ~50-100ms on a cache miss only. A write failure is still
    // non-fatal: log it and return the NOTAMs we already fetched.
    const { error: cacheError } = await supabaseAdmin
      .from('notam_cache')
      .upsert(
        {
          cache_key: station,
          notams,
          total_count: typeof json?.total === 'number' ? json.total : notams.length,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'cache_key' }
      );

    if (cacheError) {
      console.warn('⚠️ notam_cache write failed (non-fatal, quota will not be protected):', cacheError.message);
    }

    console.log(`✅ ${notams.length} NOTAM(s) received for ${station}`);
    return Response.json(notams, {
      headers: { 'x-notam-cache': cacheError ? 'miss-write-failed' : 'miss' },
    });
  } catch (error) {
    console.error('❌ SkyLink NOTAM fetch failed:', error);
    return Response.json({ error: 'Failed to fetch NOTAMs' }, { status: 502 });
  }
}
