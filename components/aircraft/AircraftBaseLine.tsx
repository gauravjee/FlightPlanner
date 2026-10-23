// components/aircraft/AircraftBaseLine.tsx — multi-base M2: an aircraft's current base, with "Move" for
// admin / super admin / operations. Shown only when the school has more than one active base.
'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { MapPin } from 'lucide-react';
import type { Aircraft } from '@/types';
import { AIRCRAFT_MOVE_ROLES } from '@/lib/permissions';
import { useBases } from '@/lib/hooks/useBases';
import { moveAircraftToBase } from '@/lib/hooks/useAircraft';
import { notify } from '@/lib/notify';

const field = 'surface-inner rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-[var(--accent)]';

export default function AircraftBaseLine({ aircraft }: { aircraft: Aircraft }) {
  const { data: session } = useSession();
  const { bases, activeBases, multiBase } = useBases();
  const [moving, setMoving] = useState(false);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!multiBase) return null;

  const current = bases.find(b => String(b.id) === aircraft.currentBaseId);
  const canMove = AIRCRAFT_MOVE_ROLES.includes(session?.user?.role ?? '');

  const submit = async () => {
    setBusy(true);
    const err = await moveAircraftToBase(aircraft.id, Number(to), note);
    setBusy(false);
    if (err) return notify(err);
    notify(`✅ ${aircraft.registration} moved to ${bases.find(b => String(b.id) === to)?.name}.`, 'success');
    setMoving(false); setTo(''); setNote('');
  };

  return (
    <div className="surface-inner p-3 mb-4 text-sm space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-secondary" /> {current?.name ?? 'Unknown base'}</span>
        {canMove && !moving && (
          <button type="button" onClick={() => setMoving(true)} className="text-xs cursor-pointer" style={{ color: 'var(--accent)' }}>Move to another base</button>
        )}
      </div>
      {moving && (
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Move to base" className={field} value={to} onChange={e => setTo(e.target.value)}>
            <option value="">Pick a base…</option>
            {activeBases.filter(b => String(b.id) !== aircraft.currentBaseId).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input aria-label="Note (optional)" placeholder="Note, e.g. ferry flight (optional)" className={`${field} flex-1 min-w-32`} value={note}
            onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} />
          <button type="button" disabled={!to || busy} onClick={submit} className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent-fill)', color: 'var(--on-accent)' }}>{busy ? 'Moving…' : 'Move'}</button>
          <button type="button" onClick={() => setMoving(false)} className="text-xs cursor-pointer text-secondary">Cancel</button>
        </div>
      )}
    </div>
  );
}
