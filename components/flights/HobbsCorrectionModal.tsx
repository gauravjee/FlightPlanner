// components/flights/HobbsCorrectionModal.tsx
// Admin-only Hobbs End correction (claude/hobbs-correction-design-2026-10-10.md).
// Two steps: Preview (dry run, changes nothing) then Confirm, so the admin sees how many later records shift first.
'use client';

import { useState } from 'react';
import type { FlightRecord } from '@/types';
import { correctHobbsEnd, type HobbsCorrectionResult } from '@/lib/hooks/useFlightRecords';
import { useEscapeToClose } from '@/lib/useEscapeToClose';
import { notify } from '@/lib/notify';

const fieldClass = 'w-full surface-inner rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-[var(--accent)]';

export default function HobbsCorrectionModal({ record, onClose }: { record: FlightRecord; onClose: () => void }) {
  useEscapeToClose(onClose);
  const [hobbsEnd, setHobbsEnd] = useState(String(record.hobbsEnd ?? ''));
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<HobbsCorrectionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (dryRun: boolean) => {
    setBusy(true);
    setError('');
    const res = await correctHobbsEnd(record.id, Number(hobbsEnd), reason, dryRun);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    if (dryRun) { setPreview(res.result!); return; }
    notify(`✅ Hobbs End corrected. ${res.result!.flightsShifted} later flight(s) shifted.`);
    onClose();
  };

  const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="surface-card w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-lg font-semibold">Correct Hobbs End</h3>
          <button onClick={onClose} className="p-2 hover:bg-[var(--surface-muted)] rounded-lg cursor-pointer" aria-label="Close">
            <span className="text-secondary text-xl">✕</span>
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <p className="text-secondary">
            {record.aircraftReg} · {record.studentName} · {new Date(record.flightDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })} · Hobbs {record.hobbsStart} → {record.hobbsEnd}
          </p>
          <div>
            <label className="block text-xs text-tertiary mb-1" htmlFor="hc-end">Correct Hobbs End *</label>
            <input id="hc-end" type="number" step="0.1" min={record.hobbsStart} value={hobbsEnd}
              onChange={e => { setHobbsEnd(e.target.value); setPreview(null); }} className={fieldClass} />
          </div>
          <div>
            <label className="block text-xs text-tertiary mb-1" htmlFor="hc-reason">Reason *</label>
            <textarea id="hc-reason" rows={2} value={reason} placeholder="e.g. Meter misread at shutdown; tech log shows 75.3"
              onChange={e => { setReason(e.target.value); setPreview(null); }} className={fieldClass} />
          </div>
          {preview && (
            <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--warning-soft)', color: 'var(--warning-text)' }} role="status">
              <p>This flight&apos;s End: {preview.oldEnd} → {preview.newEnd} ({signed(preview.delta)}).</p>
              <p>{preview.flightsShifted} later flight(s) and {preview.maintenanceShifted} maintenance reading(s) on {preview.registration} shift by {signed(preview.delta)}.</p>
              <p>{preview.registration}&apos;s Hobbs: {preview.aircraftBefore} → {preview.aircraftAfter}.</p>
            </div>
          )}
          {error && <p className="text-xs" style={{ color: 'var(--danger)' }} role="alert">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 surface-inner rounded-lg cursor-pointer">Cancel</button>
            {preview ? (
              <button type="button" disabled={busy} onClick={() => run(false)}
                className="flex-1 px-4 py-2 rounded-lg font-bold cursor-pointer disabled:opacity-60" style={{ backgroundColor: 'var(--warning)', color: '#04141a' }}>
                Confirm correction
              </button>
            ) : (
              <button type="button" disabled={busy || !reason.trim() || !hobbsEnd} onClick={() => run(true)}
                className="flex-1 px-4 py-2 rounded-lg font-bold cursor-pointer disabled:opacity-60" style={{ backgroundColor: 'var(--accent)', color: '#04141a' }}>
                Preview
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
