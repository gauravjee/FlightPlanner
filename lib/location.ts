// lib/location.ts
// Shared helper for displaying a school's field/airport identity.
//
// Two independent FTO settings feed this:
//   - airport_code:   optional ICAO code, primarily used to source live
//                      weather (see app/dashboard/page.tsx). For a field with
//                      no ICAO code of its own, a school can point this at
//                      the nearest reporting station instead, purely for
//                      reference weather — it does not have to be "their"
//                      airport.
//   - location_name:  optional free-text city/airstrip name, purely for
//                      display (header, print sheets). Independent of
//                      whether airport_code is set.
//
// Combining them here keeps Header.tsx and ScheduleBoard.tsx's print sheet
// from drifting out of sync on the display rule.

/**
 * Build the display string for a school's location, e.g.:
 *   code="VOMM", name="Chennai"   -> "VOMM - Chennai"
 *   code="",     name="ABC Farm"  -> "ABC Farm"
 *   code="VOMM", name=""          -> "VOMM"
 *   code="",     name=""          -> fallback (defaults to "VOBL - Bangalore"
 *                                     to match this app's original demo data)
 */
export function getLocationDisplay(
  airportCode: string,
  locationName: string,
  fallback = 'VOBL - Bangalore'
): string {
  const code = (airportCode || '').trim();
  const name = (locationName || '').trim();

  if (code && name) return `${code} - ${name}`;
  if (code) return code;
  if (name) return name;
  return fallback;
}
