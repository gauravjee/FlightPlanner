// components/ui/BaseSwitcher.tsx — multi-base M3: header picker for "All bases" or one base.
// Hidden while the school has a single active base.
// 2026-10-23 (UI plan Phase 1, operator: "easy flip button or a drop down"): a chip that opens a list with each
// base's opening hours and the user's home base marked; the chip turns amber when a base other than home is shown.
'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, ChevronDown, Check } from 'lucide-react';
import { useSelectedBase } from '@/lib/hooks/useSelectedBase';
import { ALL_BASES, type SelectedBase } from '@/lib/bases';

export default function BaseSwitcher() {
  const { selected, setSelected, selectedBase, activeBases, multiBase, homeBaseId } = useSelectedBase();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!multiBase) return null;
  const awayFromHome = !!selectedBase && homeBaseId != null && selectedBase.id !== homeBaseId;
  const options: { value: SelectedBase; name: string; meta: string }[] = [
    { value: ALL_BASES, name: 'All bases', meta: 'Every base together' },
    ...activeBases.map(b => ({ value: b.id, name: b.name, meta: `${b.id === homeBaseId ? 'Home base · ' : ''}${b.time_slot_start.slice(0, 5)}–${b.time_slot_end.slice(0, 5)}` })),
  ];
  const pick = (value: SelectedBase) => { setSelected(value); setOpen(false); };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
        title={awayFromHome ? 'Not your home base' : 'Change base'}
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm cursor-pointer max-w-44 sm:max-w-56"
        style={awayFromHome
          ? { backgroundColor: 'var(--warning-soft)', color: 'var(--warning-text)', border: '1px solid var(--warning)' }
          : { backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="sr-only">Base:</span>
        <span className="truncate">{selectedBase?.name ?? 'All bases'}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      </button>
      {open && (
        <div role="listbox" aria-label="Choose base" className="absolute right-0 top-full mt-2 w-64 rounded-lg shadow-lg z-30 p-1.5"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
          {options.map(o => {
            const on = o.value === selected;
            return (
              <button key={String(o.value)} type="button" role="option" aria-selected={on} onClick={() => pick(o.value)}
                className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left cursor-pointer hover:bg-[var(--surface-muted)]"
                style={on ? { backgroundColor: 'var(--accent-soft)' } : undefined}>
                <Check className="w-4 h-4 shrink-0" style={{ visibility: on ? 'visible' : 'hidden', color: 'var(--accent)' }} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">{o.name}</span>
                  <span className="block text-xs text-tertiary">{o.meta}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
