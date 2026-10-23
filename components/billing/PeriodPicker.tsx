// components/billing/PeriodPicker.tsx — billing B4b (22 Oct): week / month / financial year / custom dates.
'use client';

import { periodRange, type PeriodKind } from '@/lib/billing';

export interface PeriodState { kind: PeriodKind | 'custom'; date: string; from: string; to: string }
export const rangeOf = (p: PeriodState) => (p.kind === 'custom' ? { from: p.from, to: p.to } : periodRange(p.kind, p.date));
export const initialPeriod = (today: string): PeriodState => ({ kind: 'monthly', date: today, from: `${today.slice(0, 8)}01`, to: today });

const KINDS: { kind: PeriodState['kind']; label: string }[] = [
  { kind: 'weekly', label: 'Weekly' }, { kind: 'monthly', label: 'Monthly' }, { kind: 'annual', label: 'Annual (Apr–Mar)' }, { kind: 'custom', label: 'Custom' },
];
const input = 'surface-inner rounded-lg px-3 py-1.5 text-sm';
const btn = 'px-3 py-1.5 rounded-lg text-sm cursor-pointer';
const on = { backgroundImage: 'linear-gradient(135deg, var(--accent-fill), var(--accent-fill-strong))', color: 'var(--on-accent)' };
const off = { backgroundColor: 'var(--surface-muted)', color: 'var(--text-secondary)' };

export default function PeriodPicker({ value, onChange }: { value: PeriodState; onChange: (p: PeriodState) => void }) {
  const r = rangeOf(value);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Period">
        {KINDS.map(k => (
          <button key={k.kind} type="button" className={btn} style={value.kind === k.kind ? on : off} aria-pressed={value.kind === k.kind}
            onClick={() => onChange({ ...value, kind: k.kind })}>{k.label}</button>
        ))}
      </div>
      {value.kind === 'custom' ? (
        <>
          <label className="text-xs text-tertiary">From <input type="date" className={input} value={value.from} onChange={e => onChange({ ...value, from: e.target.value })} /></label>
          <label className="text-xs text-tertiary">To <input type="date" className={input} value={value.to} onChange={e => onChange({ ...value, to: e.target.value })} /></label>
        </>
      ) : (
        <label className="text-xs text-tertiary">Any date in the period
          <input type="date" className={`${input} block`} value={value.date} onChange={e => e.target.value && onChange({ ...value, date: e.target.value })} />
        </label>
      )}
      <span className="text-xs text-tertiary pb-2">{r.from} to {r.to}</span>
    </div>
  );
}
