// lib/flight-classification.ts
// Shared "what kind of flight was this" helpers — pulled out so the
// Progress page's hour breakdowns and the new Daily Flying Report's
// footer stats answer the exact same question the exact same way,
// instead of each keeping its own copy of the same sortieType-substring
// check. Two places computing the same number differently is exactly the
// bug class this project has hit before (the students API's
// STUDENT_STAFF_ROLES/STUDENT_WRITE_ROLES gap; the Progress page's old
// hardcoded-vs-DB requirements mismatch) — this file exists so
// cross-country/instrument/night classification can't quietly drift the
// same way.
//
// Deliberately a plain string-matching approximation, not a change in
// behavior from what the Progress page already did: a flight only counts
// as "night" if its sortieType itself contains "NIGHT" (an
// admin-configured sortie type), not from comparing the actual
// departure/arrival time against sunset/sunrise. A dual flight that
// happens to run past dusk under a non-night sortie type won't be
// counted. If DGCA-submission-grade precision is ever needed here, that's
// a distinct, larger follow-up (real astronomical twilight calculation
// per the FTO's airport coordinates) — not something to silently
// approximate differently in just one of the two places that need it.

export function isCrossCountrySortie(sortieType: string | null | undefined): boolean {
  return !!sortieType && (sortieType.includes('CROSS_COUNTRY') || sortieType.includes('NAVIGATION'));
}

export function isInstrumentSortie(sortieType: string | null | undefined): boolean {
  return !!sortieType && sortieType.includes('INSTRUMENT');
}

export function isNightSortie(sortieType: string | null | undefined): boolean {
  return !!sortieType && sortieType.includes('NIGHT');
}

// Same fallback the client store's loadFlightRecords() already used when a
// flight_record row's own total_hours column is empty (which is every
// row today — see app/api/flight-records/route.ts's POST, which never
// actually writes total_hours on insert): derive duration from the
// departure/arrival clock-time strings (HH:MM) rather than the hobbs
// readings, so this and the client agree on the same number for the same
// flight instead of two different formulas.
export function flightHoursFromTimes(
  departureTime: string | null | undefined,
  arrivalTime: string | null | undefined
): number {
  if (!departureTime || !arrivalTime) return 0;
  const [dh, dm] = departureTime.split(':').map(Number);
  const [ah, am] = arrivalTime.split(':').map(Number);
  if ([dh, dm, ah, am].some(n => Number.isNaN(n))) return 0;
  return Math.round(((ah * 60 + am) - (dh * 60 + dm)) / 6) / 10;
}
