// app/dashboard/admin/setup/StaffIdSection.tsx
// Admin Setup -> FTO Settings: the staff ID prefix (B2, 2026-09-24).
// PREFIX + E + joining YYMM + running number, 15 characters. The prefix can be
// changed only until the first staff ID is issued; after that it's locked.
// Saves on its own via PUT /api/staff-id-settings.

'use client';

import { useEffect, useState } from 'react';
import { IdCard, Save, Lock } from 'lucide-react';
import { formatStaffId, isValidStaffPrefix } from '@/lib/staff-id';
import { todayIST } from '@/lib/ist';

type Settings = { prefix: string | null; nextNumber: number; subNextNumber: number; issued: number; locked: boolean };

export default function StaffIdSection() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [prefix, setPrefix] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // bumped after a save to reload
  const [today] = useState(todayIST); // fixed at load (no clock reads in render)

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/staff-id-settings');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage({ ok: false, text: body.error || 'Failed to load staff ID settings.' }); return; }
      setSettings(body);
      setPrefix(body.prefix ?? '');
    })();
  }, [reloadKey]);

  const p = prefix.trim().toUpperCase();
  const valid = isValidStaffPrefix(p);
  const preview = settings && valid ? formatStaffId(p, today, settings.nextNumber) : null;

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const res = await fetch('/api/staff-id-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: p }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setMessage({ ok: false, text: body.error || 'Failed to save the staff ID prefix.' }); return; }
    setMessage({ ok: true, text: `Saved — new staff IDs start with ${p}E.` });
    setReloadKey(k => k + 1);
  };

  const inputClass = 'w-full surface-card rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)] disabled:opacity-60';

  return (
    <div className="surface-inner p-4 mt-4">
      <h3 className="text-sm font-medium mb-1 flex items-center gap-1.5">
        <IdCard className="w-3.5 h-3.5" /> Staff IDs
      </h3>
      <p className="text-xs text-tertiary mb-4">
        Staff get an ID automatically when their record is saved: prefix + E + joining month (YYMM) + running number, always 15 characters.
        One running number for everyone, never reset. Contract AMEs get SUB IDs with their own numbering.
      </p>
      {!settings ? <p className="text-sm text-secondary">{message ? '' : 'Loading…'}</p> : (<>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label htmlFor="staff-id-prefix" className="block text-xs text-tertiary mb-1">Prefix (1–5 letters or digits)</label>
            <input id="staff-id-prefix" type="text" value={prefix} maxLength={5}
              onChange={e => setPrefix(e.target.value.toUpperCase())} disabled={settings.locked}
              placeholder="e.g. HFA" className={inputClass} />
          </div>
          <div className="text-sm">
            <span className="block text-xs text-tertiary mb-1">Next ID (if joining this month)</span>
            <span className="font-medium font-mono">{preview ?? '—'}</span>
          </div>
          <div className="text-sm">
            <span className="block text-xs text-tertiary mb-1">Next contract AME ID</span>
            <span className="font-medium font-mono">{formatStaffId('SUB', today, settings.subNextNumber)}</span>
          </div>
        </div>
        {settings.locked ? (
          <p className="text-xs text-tertiary mt-3 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Locked: {settings.issued} staff ID{settings.issued === 1 ? '' : 's'} issued with {settings.prefix}. The prefix can&apos;t be changed.
          </p>
        ) : (
          <>
            <p className="text-xs mt-3" style={{ color: 'var(--warning-text)' }}>The prefix locks once the first staff ID is issued. Check it before adding staff.</p>
            <div className="flex items-center gap-3 mt-3">
              <button type="button" onClick={save} disabled={saving || !valid || p === settings.prefix}
                className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}>
                <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Staff ID Prefix'}
              </button>
            </div>
          </>
        )}
      </>)}
      {message && <p className="text-xs mt-2" style={{ color: message.ok ? 'var(--success)' : 'var(--danger)' }}>{message.text}</p>}
    </div>
  );
}
