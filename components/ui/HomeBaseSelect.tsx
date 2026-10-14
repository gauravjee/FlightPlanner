// components/ui/HomeBaseSelect.tsx — multi-base M2: a person's home base (it sets their default view;
// it never limits where they can be booked). Rendered only when the school has more than one active base.
'use client';

import { useBases } from '@/lib/hooks/useBases';
import { BASE1_ID } from '@/lib/bases';

interface Props {
  id: string;
  value: string; // '' = not chosen yet: shown as Base 1, which is also the database default
  onChange: (value: string) => void;
  className: string;
  labelClassName: string;
}

export default function HomeBaseSelect({ id, value, onChange, className, labelClassName }: Props) {
  const { bases, multiBase } = useBases();
  if (!multiBase) return null;
  const shown = value || String(BASE1_ID);
  return (
    <div>
      <label htmlFor={id} className={labelClassName}>Home base</label>
      <select id={id} value={shown} onChange={e => onChange(e.target.value)} className={className}>
        {bases.filter(b => b.is_active || String(b.id) === shown).map(b => (
          <option key={b.id} value={b.id}>{b.name}{b.is_active ? '' : ' (inactive)'}</option>
        ))}
      </select>
    </div>
  );
}
