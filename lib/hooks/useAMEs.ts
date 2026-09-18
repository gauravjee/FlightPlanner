// lib/hooks/useAMEs.ts
// Certifying Engineers (AME) roster — read-only reference list for
// MaintenanceForm.tsx's and MaintenanceDueSection.tsx's completion flows
// (2026-09-18, P0 #4: maintenance can no longer be marked COMPLETED
// without naming a certifying AME — see add-ames-table.sql). Managed via
// Admin Setup -> Certifying Engineers (AMEsTab.tsx, via ConfigTable.tsx).
// Same shape as useSortieTypes.ts — read-only here, no write function.

'use client';

import useSWR from 'swr';

export interface AME {
  id: number;
  name: string;
  license_no: string;
}

export const amesKey = ['ames'] as const;

export async function fetchAMEs(): Promise<AME[]> {
  const res = await fetch('/api/admin/config/ames?orderBy=name&filterColumn=is_active&filterValue=true');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('Error loading AMEs:', err.error || res.statusText);
    throw new Error(err.error || 'Failed to load AMEs.');
  }
  const { rows } = await res.json();
  return (rows || []).map((row: Record<string, unknown>) => ({
    id: row.id as number,
    name: row.name as string,
    license_no: row.license_no as string,
  }));
}

export function useAMEs() {
  const { data, error, isLoading } = useSWR<AME[]>(amesKey, () => fetchAMEs());
  return { ames: data ?? [], isLoading, error };
}
