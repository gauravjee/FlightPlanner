// app/dashboard/admin/setup/EnrollmentSeriesSection.tsx
// Admin Setup -> FTO Settings: student enrollment numbers (2026-09-24).
// Current prefix + starting number, a preview of the next number, and the
// previous series with the last number each issued. Saves on its own via
// PUT /api/enrollment-series (not "Save All Settings"). The prefix is
// changed by hand, usually at the start of the academic year.

'use client';

import { useEffect, useState } from 'react';
import { Hash, Save } from 'lucide-react';
import { parseStartNumber, formatEnrollmentId, ENROLLMENT_PREFIX_RE } from '@/lib/enrollment';

type Series = { prefix: string; startNumber: string; isCurrent: boolean; used: boolean; next: string; lastIssued: string | null };

export default function EnrollmentSeriesSection() {
  const [series, setSeries] = useState<Series[] | null>(null);
  const [prefix, setPrefix] = useState('');
  const [start, setStart] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [reloadKey, setReloadKey] = useState(0); // bumped after a save to reload
  useEffect(() => {
    (async () => {
      const res = await fetch('/api/enrollment-series');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setSeries([]); setMessage({ ok: false, text: body.error || 'Failed to load enrollment numbers.' }); return; }
      setSeries(body.series);
      const current = (body.series as Series[]).find(s => s.isCurrent);
      if (current) { setPrefix(current.prefix); setStart(current.startNumber); }
    })();
  }, [reloadKey]);

  const p = prefix.trim();
  const existing = series?.find(s => s.prefix === p);
  const locked = !!existing?.used;
  const parsed = parseStartNumber(start);
  const preview = !ENROLLMENT_PREFIX_RE.test(p) ? null
    : locked ? existing!.next
    : parsed ? formatEnrollmentId(p, parsed.start, parsed.width) : null;

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const res = await fetch('/api/enrollment-series', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: p, startNumber: locked ? '' : start }), // a used prefix keeps its start
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setMessage({ ok: false, text: body.error || 'Failed to save enrollment numbers.' }); return; }
    setMessage({ ok: true, text: `Saved — new students get numbers from ${p}.` });
    setReloadKey(k => k + 1);
  };

  const inputClass = 'w-full surface-card rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)] disabled:opacity-60';
  const previous = (series ?? []).filter(s => !s.isCurrent);

  return (
    <div className="surface-inner p-4">
      <h3 className="text-sm font-medium mb-1 flex items-center gap-1.5">
        <Hash className="w-3.5 h-3.5" /> Enrollment Numbers
      </h3>
      <p className="text-xs text-tertiary mb-4">
        New students get the next number automatically when they&apos;re saved: prefix + number, no separator.
        Change the prefix by hand at the start of each academic year; each prefix keeps its own count. Issued numbers can&apos;t be edited.
      </p>
      {series === null ? <p className="text-sm text-secondary">Loading…</p> : (<>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label htmlFor="enrollment-prefix" className="block text-xs text-tertiary mb-1">Current prefix</label>
            <input id="enrollment-prefix" type="text" value={prefix} onChange={e => setPrefix(e.target.value)}
              placeholder="e.g. HFA2026-27" className={inputClass} />
          </div>
          <div>
            <label htmlFor="enrollment-start" className="block text-xs text-tertiary mb-1">Starting number</label>
            <input id="enrollment-start" type="text" inputMode="numeric" value={locked ? existing!.startNumber : start}
              onChange={e => setStart(e.target.value)} disabled={locked} placeholder="e.g. 0001 or 1001" className={inputClass} />
          </div>
          <div className="text-sm">
            <span className="block text-xs text-tertiary mb-1">Next number</span>
            <span className="font-medium">{preview ?? '—'}</span>
          </div>
        </div>
        {locked && <p className="text-xs text-tertiary mt-2">{p} has already issued numbers, so its starting number is locked.</p>}
        <div className="flex items-center gap-3 mt-3">
          <button type="button" onClick={save} disabled={saving || !preview}
            className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}>
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Enrollment Numbers'}
          </button>
          {message && <span className="text-xs" style={{ color: message.ok ? 'var(--success)' : 'var(--danger)' }}>{message.text}</span>}
        </div>
        {previous.length > 0 && (
          <div className="mt-4 text-xs text-tertiary">
            <p className="mb-1">Previous series:</p>
            <ul className="space-y-0.5">
              {previous.map(s => <li key={s.prefix}>{s.prefix} · {s.lastIssued ? `last issued ${s.lastIssued}` : 'no numbers issued'}</li>)}
            </ul>
          </div>
        )}
      </>)}
    </div>
  );
}
