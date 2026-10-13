// components/flights/HobbsCorrectionHistory.tsx
// Admin-only list of Hobbs corrections (who, when, why, old → new), the evidence trail for the DGCA.
'use client';

import type { HobbsCorrection } from '@/lib/hooks/useFlightRecords';
import { History } from 'lucide-react';

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
});
const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

export default function HobbsCorrectionHistory({ corrections }: { corrections: HobbsCorrection[] }) {
  return (
    <details className="surface-card p-6 mt-6">
      <summary className="text-lg font-semibold flex items-center gap-2 cursor-pointer">
        <History className="w-4 h-4 text-secondary" /> Hobbs correction history ({corrections.length})
      </summary>
      {corrections.length === 0 ? (
        <p className="text-secondary text-sm mt-4">No Hobbs corrections yet.</p>
      ) : (
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm [&_th]:pr-3 [&_td]:pr-3">
            <thead>
              <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                <th className="pb-3">When (IST)</th>
                <th className="pb-3">Aircraft</th>
                <th className="pb-3">Corrected</th>
                <th className="pb-3">Hobbs</th>
                <th className="pb-3">Also shifted</th>
                <th className="pb-3">Reason</th>
                <th className="pb-3">By</th>
              </tr>
            </thead>
            <tbody className="text-secondary">
              {corrections.map(c => (
                <tr key={c.id} className="border-b" style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
                  <td className="py-2 text-xs whitespace-nowrap">{when(c.corrected_at)}</td>
                  <td className="py-2 text-xs">{c.aircraft?.registration ?? '—'}</td>
                  <td className="py-2 text-xs">{c.flight_record_id ? 'Flight Hobbs End' : 'Aircraft reading only'}</td>
                  <td className="py-2 text-xs whitespace-nowrap">{c.old_end} → {c.new_end} ({signed(Number(c.delta))})</td>
                  <td className="py-2 text-xs">{c.flight_record_id ? `${c.flights_shifted} flight(s), ${c.maintenance_shifted} maint.` : '—'}</td>
                  <td className="py-2 text-xs">{c.reason}</td>
                  <td className="py-2 text-xs">{c.corrected_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
