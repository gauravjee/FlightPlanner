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

// 2026-08-19: unlike the three helpers above, Multi Engine and Simulator
// hours are properties of WHICH AIRCRAFT was flown, not which sortie/
// maneuver was performed — a cross-country flight in a multi-engine
// aircraft still counts as multi-engine time, and vice versa. So these two
// take the aircraft record itself (looked up via the flight's aircraftId),
// not a sortieType string. See restructure-aircraft-type-model.sql for how
// `type`/`isSimulator` got their current meaning on the aircraft table.
export function isMultiEngineFlight(aircraft: { type?: string | null } | null | undefined): boolean {
  return aircraft?.type === 'Multi Engine';
}

export function isSimulatorFlight(aircraft: { isSimulator?: boolean | null } | null | undefined): boolean {
  return !!aircraft?.isSimulator;
}

// Fallback for a flight_record row whose own total_hours column is empty
// (old rows inserted before 2026-09-18 — see app/api/flight-records/route.ts's
// POST, which now computes and persists total_hours with this same function
// going forward): derive duration from the departure/arrival clock-time
// strings (HH:MM) rather than the hobbs readings, so every caller agrees on
// the same number for the same flight instead of each keeping its own copy
// of this arithmetic (FlightRecordForm.tsx used to; now imports this).
//
// 2026-09-18 (P0 #1, flight-hours integrity): midnight-crossing guard added.
// A sortie that departs before midnight and arrives after (e.g. 22:30 ->
// 00:15) used to produce a large NEGATIVE duration (ah*60+am is smaller than
// dh*60+dm once arrival has wrapped past 00:00), which flowed uncorrected
// into the logbook, Progress totals, PIC/solo sums, and the DGCA PDF — see
// claude/full-codebase-audit-2026-09-17.md's C1/C6. Any negative raw diff is
// now treated as a same-flight midnight crossing and wrapped by 24h, which
// covers the real case this app has (a training sortie never spans more
// than a few hours); it does not attempt to distinguish that from a garbled
// arrival-before-departure data-entry error, which the app has no way to
// detect from time-of-day alone anyway.
export function flightHoursFromTimes(
  departureTime: string | null | undefined,
  arrivalTime: string | null | undefined
): number {
  if (!departureTime || !arrivalTime) return 0;
  const [dh, dm] = departureTime.split(':').map(Number);
  const [ah, am] = arrivalTime.split(':').map(Number);
  if ([dh, dm, ah, am].some(n => Number.isNaN(n))) return 0;
  let diffMinutes = (ah * 60 + am) - (dh * 60 + dm);
  if (diffMinutes < 0) diffMinutes += 24 * 60;
  return Math.round(diffMinutes / 6) / 10;
}
