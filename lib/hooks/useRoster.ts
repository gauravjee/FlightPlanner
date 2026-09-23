// lib/hooks/useRoster.ts
// Instructor duty roster (2026-09-23) — SWR read + write helpers for
// app/api/roster/route.ts, same shape as useAvailability.ts. Rows are mapped
// to lib/roster.ts's WeeklyRow / RosterException so the page, the booking
// form and the status all feed the same rule.

'use client';

import useSWR, { mutate } from 'swr';
import type { WeeklyRow, RosterException } from '@/lib/roster';

export const rosterKey = ['roster'] as const;

export type RosterData = {
  weekly: WeeklyRow[];
  exceptions: (RosterException & { note: string; createdBy: string })[];
};

const hhmm = (t: unknown) => (typeof t === 'string' && t ? t.slice(0, 5) : null);

export async function fetchRoster(): Promise<RosterData> {
  const res = await fetch('/api/roster');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Failed to load the duty roster.');
  return {
    weekly: (body.weekly ?? []).map((r: Record<string, unknown>) => ({
      instructorId: String(r.instructor_id), weekday: Number(r.weekday),
      startTime: hhmm(r.start_time), endTime: hhmm(r.end_time),
    })),
    exceptions: (body.exceptions ?? []).map((r: Record<string, unknown>) => ({
      instructorId: String(r.instructor_id), date: String(r.date),
      startTime: hhmm(r.start_time), endTime: hhmm(r.end_time),
      note: (r.note as string) || '', createdBy: (r.created_by as string) || '',
    })),
  };
}

export function useRoster() {
  const { data, error, isLoading } = useSWR<RosterData>(rosterKey, fetchRoster);
  return { weekly: data?.weekly ?? [], exceptions: data?.exceptions ?? [], isLoading, error };
}

// Writes return an error message, or null on success, and refresh the roster.
async function write(url: string, method: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) return result.error || 'Something went wrong.';
  await mutate(rosterKey);
  return null;
}

export function saveWeeklyRoster(instructorId: string, days: { weekday: number; startTime: string | null; endTime: string | null }[]) {
  return write('/api/roster', 'PUT', { instructorId, days });
}

export function setRosterException(e: { instructorId: string; date: string; startTime: string | null; endTime: string | null; note: string }) {
  return write('/api/roster', 'POST', e);
}

export function removeRosterException(instructorId: string, date: string) {
  return write(`/api/roster?instructorId=${encodeURIComponent(instructorId)}&date=${encodeURIComponent(date)}`, 'DELETE');
}
