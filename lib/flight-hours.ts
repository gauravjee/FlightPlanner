// lib/flight-hours.ts
// ---------------------------------------------------------------------------
// 2026-09-10: pilot-in-command time, in ONE place.
//
// This exists because "Solo Hours" was being computed inline as
// `flights.filter(f => f.flightType === 'SOLO')` in three separate files
// (Progress page, lib/pdf.ts twice) — the same shape of duplication that
// produced the NaN% bug earlier the same day, where identical arithmetic
// was inlined at three call sites and every one of them was wrong. PIC is
// a two-part sum rather than a filter, so leaving it inline would be worse.
//
// THE DISTINCTION THAT MATTERS. Solo time and PIC time are not the same
// thing, and the app previously treated them as if they were:
//
//   SOLO sortie  -> the student is the commander for the entire flight.
//                   PIC = totalHours. Derived, never stored, so it cannot
//                   drift if the flight's duration is later corrected.
//   DUAL sortie  -> the student MAY have acted as commander with the
//                   instructor aboard. DGCA calls this PICUS (Pilot in
//                   Command Under Supervision). Only the instructor knows,
//                   so it is entered by hand and counts toward PIC.
//
// A CPL candidate building PIC time on dual sorties was previously
// undercounted by exactly the PICUS portion, which is the part this fixes.
// ---------------------------------------------------------------------------

import type { FlightRecord } from '@/types';

/** PIC hours credited by a single flight record. */
export function picHoursFor(f: Pick<FlightRecord, 'flightType' | 'totalHours' | 'picusHours'>): number {
  if (f.flightType === 'SOLO') return f.totalHours || 0;
  // Clamped: a mis-typed PICUS figure must never credit more command time
  // than the aircraft was airborne. The forms clamp on input too; this is
  // the backstop for rows that predate that, or that arrive another way.
  return Math.min(f.picusHours ?? 0, f.totalHours || 0);
}

/** Total PIC hours across a set of flights — solo time plus PICUS. */
export function totalPicHours(flights: FlightRecord[]): number {
  return flights.reduce((sum, f) => sum + picHoursFor(f), 0);
}

/** Solo-only hours, still reported separately on the DGCA progress PDF. */
export function totalSoloHours(flights: FlightRecord[]): number {
  return flights
    .filter(f => f.flightType === 'SOLO')
    .reduce((sum, f) => sum + (f.totalHours || 0), 0);
}
