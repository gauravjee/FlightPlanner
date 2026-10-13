// components/aircraft/AircraftReadingCorrection.tsx
// Admin-only "Correct reading" for an aircraft's Hobbs alone (flights unchanged), shown inside the aircraft
// edit forms. Inline rather than a second modal; Enter is swallowed so it can't submit the outer form.
'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { correctAircraftHobbs } from '@/lib/hooks/useAircraft';
import { notify } from '@/lib/notify';

const fieldClass = 'w-full surface-inner rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-[var(--accent)]';
const noEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') e.preventDefault(); };

export default function AircraftReadingCorrection({ aircraftId, current, onCorrected }: {
  aircraftId: string; current: number; onCorrected: (reading: number) => void;
}) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(String(current ?? ''));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!['admin', 'super_admin'].includes(session?.user?.role ?? '')) return null;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] underline mt-1 cursor-pointer" style={{ color: 'var(--accent)' }}>
        Correct reading only…
      </button>
    );
  }

  const apply = async () => {
    setBusy(true);
    setError('');
    const res = await correctAircraftHobbs(aircraftId, Number(reading), reason);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    notify(`✅ ${res.result!.registration} Hobbs ${res.result!.before} → ${res.result!.after}. Flights unchanged.`);
    onCorrected(res.result!.after);
    setOpen(false);
    setReason('');
  };

  return (
    <div className="mt-2 p-2 rounded-lg space-y-2" style={{ border: '1px solid var(--border)' }}>
      <p className="text-[11px] text-tertiary">Changes the aircraft&apos;s reading only (e.g. a misread or an engine ground run). Logged flights stay as they are.</p>
      <label className="block text-[11px] text-tertiary" htmlFor={`acr-${aircraftId}`}>New reading *</label>
      <input id={`acr-${aircraftId}`} type="number" step="0.1" min={0} value={reading} onKeyDown={noEnter}
        onChange={e => setReading(e.target.value)} className={fieldClass} />
      <label className="block text-[11px] text-tertiary" htmlFor={`acr-reason-${aircraftId}`}>Reason *</label>
      <input id={`acr-reason-${aircraftId}`} type="text" value={reason} onKeyDown={noEnter} placeholder="e.g. Engine ground run after maintenance"
        onChange={e => setReason(e.target.value)} className={fieldClass} />
      {error && <p className="text-[11px]" style={{ color: 'var(--danger)' }} role="alert">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => { setOpen(false); setError(''); }} className="flex-1 px-2 py-1 surface-inner rounded-lg text-xs cursor-pointer">Cancel</button>
        <button type="button" disabled={busy || !reason.trim() || reading === ''} onClick={apply}
          className="flex-1 px-2 py-1 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-60" style={{ backgroundColor: 'var(--warning)', color: '#04141a' }}>
          Apply correction
        </button>
      </div>
    </div>
  );
}
