// components/ui/BaseSwitcher.tsx — multi-base M3: header picker for "All bases" or one base.
// Hidden while the school has a single active base.
'use client';

import { MapPin } from 'lucide-react';
import { useSelectedBase } from '@/lib/hooks/useSelectedBase';
import { ALL_BASES } from '@/lib/bases';

export default function BaseSwitcher() {
  const { selected, setSelected, activeBases, multiBase } = useSelectedBase();
  if (!multiBase) return null;
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <MapPin className="w-4 h-4 text-secondary" aria-hidden="true" />
      <span className="sr-only">Base</span>
      <select
        value={String(selected)}
        onChange={e => setSelected(e.target.value === ALL_BASES ? ALL_BASES : Number(e.target.value))}
        className="surface-inner rounded-lg px-2 py-1 text-sm max-w-36 sm:max-w-48 focus:outline-none focus:border-[var(--accent)]"
      >
        <option value={ALL_BASES}>All bases</option>
        {activeBases.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </label>
  );
}
