// app/dashboard/admin/setup/BasesTab.tsx — multi-base M2 (claude/multi-base-design-2026-10-15.md).
// Each base has its own airport (or coordinates) for weather, opening hours / slots and weekly offs.
// Bases are never deleted, only deactivated; Base 1 can't be deactivated. Until step M3 the rest of the
// app still reads FTO Settings, which the server keeps identical to Base 1 (either side can be edited).
'use client';

import { useState } from 'react';
import { MapPin, Pencil, Plus, Save, X } from 'lucide-react';
import { notify } from '@/lib/notify';
import { DAY_NAMES, parseWeeklyOffDays } from '@/lib/store';
import { BASE1_ID, type BaseRow } from '@/lib/bases';
import { useBases } from '@/lib/hooks/useBases';
import { ftoSettingsKey } from '@/lib/hooks/useFtoSettings';
import { mutate as globalMutate } from 'swr';

type Form = Omit<BaseRow, 'id'>;
const EMPTY: Form = {
  name: '', code: '', airport_code: '', location_name: '', latitude: '', longitude: '',
  time_slot_start: '06:00', time_slot_end: '20:00', time_slot_interval: 15,
  weekly_off_days: '', partial_weekly_off_days: '', is_active: true,
};
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];
const input = 'w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]';
const label = 'block text-xs text-secondary mb-1';
const primaryBtn = 'px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50';
const primaryStyle = { backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: 'var(--on-accent)' };
const secondaryBtn = 'px-4 py-2 rounded-lg text-sm flex items-center gap-1.5 cursor-pointer surface-inner';

/** Lenient read of the partial rule while editing: a day may be picked before any week is ticked. */
function partialDraft(raw: string): { day: number | null; occurrences: number[] } {
  try {
    const p = JSON.parse(raw);
    if (typeof p?.day === 'number' && Array.isArray(p.occurrences)) return { day: p.day, occurrences: p.occurrences };
  } catch { /* unset */ }
  return { day: null, occurrences: [] };
}

function offSummary(b: BaseRow): string {
  const full = parseWeeklyOffDays(b.weekly_off_days).map(d => DAY_NAMES[d].slice(0, 3));
  const p = partialDraft(b.partial_weekly_off_days);
  const partial = p.day !== null && p.occurrences.length ? `${p.occurrences.map(o => ORDINALS[o - 1]).join(', ')} ${DAY_NAMES[p.day].slice(0, 3)}` : '';
  return [...full, partial].filter(Boolean).join(' · ') || 'None';
}

export default function BasesTab() {
  const { bases, isLoading, mutate } = useBases();
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }));

  const open = (b: BaseRow | null) => {
    setEditingId(b ? b.id : 'new');
    setForm(b ? { ...EMPTY, ...b, airport_code: b.airport_code ?? '', location_name: b.location_name ?? '', latitude: b.latitude ?? '', longitude: b.longitude ?? '' } : EMPTY);
  };

  const offDays = parseWeeklyOffDays(form.weekly_off_days);
  const partial = partialDraft(form.partial_weekly_off_days);
  const toggleOff = (d: number) => {
    const next = offDays.includes(d) ? offDays.filter(x => x !== d) : [...offDays, d].sort();
    setForm(f => ({ ...f, weekly_off_days: next.join(','), partial_weekly_off_days: partial.day !== null && next.includes(partial.day) ? '' : f.partial_weekly_off_days }));
  };
  const setPartialDay = (v: string) => set('partial_weekly_off_days', v === '' ? '' : JSON.stringify({ day: Number(v), occurrences: [] }));
  const togglePartialWeek = (o: number) => {
    if (partial.day === null) return;
    const next = partial.occurrences.includes(o) ? partial.occurrences.filter(x => x !== o) : [...partial.occurrences, o].sort((a, b) => a - b);
    set('partial_weekly_off_days', JSON.stringify({ day: partial.day, occurrences: next }));
  };

  const save = async () => {
    setSaving(true);
    const isNew = editingId === 'new';
    const blank = (v: string | null) => (v?.trim() ? v.trim() : null);
    const body = {
      ...form, name: form.name.trim(), code: form.code.trim().toUpperCase(),
      airport_code: blank(form.airport_code?.toUpperCase() ?? null), location_name: blank(form.location_name), latitude: blank(form.latitude), longitude: blank(form.longitude),
    };
    const res = await fetch('/api/admin/config/bases', {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isNew ? body : { id: editingId, ...body }),
    });
    setSaving(false);
    if (!res.ok) return notify((await res.json().catch(() => ({}))).error || 'Failed to save the base.');
    notify(isNew ? '✅ Base added.' : '✅ Base saved.', 'success');
    setEditingId(null);
    await mutate();
    if (editingId === BASE1_ID) globalMutate(ftoSettingsKey); // Base 1 edits were copied into FTO Settings
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-secondary" /> Bases</h3>
          <p className="text-xs text-tertiary mt-1">
            Airfields the school operates from. Each base has its own airport (or coordinates) for weather, opening hours and weekly offs.
            Base 1 is kept identical to FTO Settings. Bases are deactivated, never deleted.
          </p>
        </div>
        {editingId === null && (
          <button type="button" onClick={() => open(null)} className={`${primaryBtn} shrink-0`} style={primaryStyle}><Plus className="w-4 h-4" /> Add base</button>
        )}
      </div>

      {editingId !== null && (
        <div className="surface-inner rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label htmlFor="b-name" className={label}>Name *</label><input id="b-name" className={input} value={form.name} onChange={e => set('name', e.target.value)} /></div>
            <div><label htmlFor="b-code" className={label}>Short code *</label><input id="b-code" className={input} maxLength={8} value={form.code} onChange={e => set('code', e.target.value.toUpperCase())} placeholder="e.g. B2" /></div>
            <div><label htmlFor="b-icao" className={label}>Airport ICAO code (wins over coordinates)</label><input id="b-icao" className={input} maxLength={4} value={form.airport_code ?? ''} onChange={e => set('airport_code', e.target.value.toUpperCase())} /></div>
            <div><label htmlFor="b-loc" className={label}>Location name</label><input id="b-loc" className={input} value={form.location_name ?? ''} onChange={e => set('location_name', e.target.value)} /></div>
            <div><label htmlFor="b-lat" className={label}>Latitude</label><input id="b-lat" className={input} inputMode="decimal" value={form.latitude ?? ''} onChange={e => set('latitude', e.target.value)} /></div>
            <div><label htmlFor="b-lon" className={label}>Longitude</label><input id="b-lon" className={input} inputMode="decimal" value={form.longitude ?? ''} onChange={e => set('longitude', e.target.value)} /></div>
            <div><label htmlFor="b-start" className={label}>Opens</label><input id="b-start" type="time" className={input} value={form.time_slot_start} onChange={e => set('time_slot_start', e.target.value)} /></div>
            <div><label htmlFor="b-end" className={label}>Closes</label><input id="b-end" type="time" className={input} value={form.time_slot_end} onChange={e => set('time_slot_end', e.target.value)} /></div>
            <div><label htmlFor="b-int" className={label}>Slot interval (minutes)</label><input id="b-int" type="number" min={5} max={120} className={input} value={form.time_slot_interval} onChange={e => set('time_slot_interval', Number(e.target.value))} /></div>
          </div>
          <fieldset>
            <legend className={label}>Weekly off days</legend>
            <div className="flex flex-wrap gap-2">
              {DAY_NAMES.map((d, i) => (
                <label key={d} className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="checkbox" checked={offDays.includes(i)} onChange={() => toggleOff(i)} /> {d.slice(0, 3)}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-wrap items-center gap-2">
            <legend className={label}>Partial weekly off (e.g. 2nd and 4th Saturday)</legend>
            <select aria-label="Partial weekly off day" className={`${input} w-auto`} value={partial.day ?? ''} onChange={e => setPartialDay(e.target.value)}>
              <option value="">None</option>
              {DAY_NAMES.map((d, i) => <option key={d} value={i} disabled={offDays.includes(i)}>{d}</option>)}
            </select>
            {partial.day !== null && ORDINALS.map((o, i) => (
              <label key={o} className="flex items-center gap-1 text-sm cursor-pointer">
                <input type="checkbox" checked={partial.occurrences.includes(i + 1)} onChange={() => togglePartialWeek(i + 1)} /> {o}
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active} disabled={editingId === BASE1_ID} onChange={e => set('is_active', e.target.checked)} /> Active
            {editingId === BASE1_ID && <span className="text-xs text-tertiary">(Base 1 is always active)</span>}
          </label>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setEditingId(null)} className={secondaryBtn} style={{ border: '1px solid var(--border)' }}><X className="w-4 h-4" /> Cancel</button>
            <button type="button" onClick={save} disabled={saving || !form.name.trim() || !form.code.trim()} className={primaryBtn} style={primaryStyle}><Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}

      {isLoading ? <p className="text-sm text-tertiary">Loading…</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm [&_th]:pr-3 [&_td]:pr-3">
            <thead><tr className="text-left text-xs text-tertiary"><th>Base</th><th>Weather from</th><th>Hours</th><th>Off</th><th>Status</th><th><span className="sr-only">Edit</span></th></tr></thead>
            <tbody>
              {bases.map(b => (
                <tr key={b.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="py-2"><span className="font-semibold">{b.name}</span> <span className="text-xs text-tertiary font-mono">{b.code}</span></td>
                  <td className="py-2 text-xs">{b.airport_code || (b.latitude && b.longitude ? `${b.latitude}, ${b.longitude}` : '—')}</td>
                  <td className="py-2 text-xs">{b.time_slot_start}–{b.time_slot_end} · {b.time_slot_interval} min</td>
                  <td className="py-2 text-xs">{offSummary(b)}</td>
                  <td className="py-2"><span className={`badge ${b.is_active ? 'badge-success' : 'badge-danger'}`}>{b.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td className="py-2 text-right">
                    <button type="button" onClick={() => open(b)} aria-label={`Edit ${b.name}`} className="p-1 cursor-pointer"><Pencil className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
