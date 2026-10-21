// app/dashboard/admin/setup/BillingTab.tsx — billing B1 (21 Oct; claude/billing-design-2026-10-20.md).
// School hourly rates per aircraft category (the rate covers the instructor) with GST %, and the switch that
// makes bookings need enough balance + credit. Per-student rates are set on the Accounts page.

'use client';

import { useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { ftoSettingsKey } from '@/lib/hooks/useFtoSettings';
import { notify } from '@/lib/notify';
import { CATEGORY_LABEL, type BillingCategory } from '@/lib/billing';
import { IndianRupee } from 'lucide-react';

interface RateRow { id: number; category: BillingCategory; hourly_rate: number; gst_rate: number }
interface SettingRow { id: number; setting_key: string; setting_value: string }

const rows = async <T,>(url: string): Promise<T[]> => {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Failed to load.');
  return body.rows ?? [];
};
const inputClass = 'surface-inner rounded-lg px-3 py-2 text-sm w-full focus:outline-none';

export default function BillingTab() {
  const { data: rates, mutate } = useSWR('/api/admin/config/billing-rates?orderBy=id', rows<RateRow>);
  const { data: settings, mutate: mutateSettings } = useSWR('/api/admin/config/fto-settings', rows<SettingRow>);
  // Only the fields being edited; anything not in here shows the saved value.
  const [draft, setDraft] = useState<Record<number, { hourly_rate?: string; gst_rate?: string }>>({});
  const valueOf = (r: RateRow) => ({ hourly_rate: draft[r.id]?.hourly_rate ?? String(r.hourly_rate), gst_rate: draft[r.id]?.gst_rate ?? String(r.gst_rate) });
  const [saving, setSaving] = useState(false);
  const block = settings?.find(s => s.setting_key === 'billing_booking_block');

  const patch = (endpoint: string, body: Record<string, unknown>) =>
    fetch(`/api/admin/config/${endpoint}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const saveRates = async () => {
    for (const r of rates ?? []) {
      const d = valueOf(r);
      const rate = Number(d.hourly_rate), gst = Number(d.gst_rate);
      if (!(rate >= 0) || !(gst >= 0 && gst <= 100) || d.hourly_rate.trim() === '' || d.gst_rate.trim() === '') {
        notify(`${CATEGORY_LABEL[r.category]}: enter a rate of 0 or more and a GST % from 0 to 100.`);
        return;
      }
    }
    setSaving(true);
    try {
      for (const r of rates ?? []) {
        const d = valueOf(r);
        if (Number(d.hourly_rate) === Number(r.hourly_rate) && Number(d.gst_rate) === Number(r.gst_rate)) continue;
        const res = await patch('billing-rates', { id: r.id, hourly_rate: Number(d.hourly_rate), gst_rate: Number(d.gst_rate) });
        if (!res.ok) {
          notify((await res.json().catch(() => ({}))).error || `Could not save the ${CATEGORY_LABEL[r.category]} rate.`);
          await mutate();
          return;
        }
      }
      await mutate();
      setDraft({});
      notify('Rates saved.');
    } finally {
      setSaving(false);
    }
  };

  const toggleBlock = async (on: boolean) => {
    if (!block) return;
    const res = await patch('fto-settings', { id: block.id, setting_value: on ? 'true' : 'false' });
    if (!res.ok) notify((await res.json().catch(() => ({}))).error || 'Could not change the setting.');
    await mutateSettings();
    globalMutate(ftoSettingsKey);
  };

  return (
    <div className="surface-card p-5">
      <h2 className="text-lg font-semibold mb-1 flex items-center gap-2"><IndianRupee className="w-4 h-4 text-secondary" /> Billing</h2>
      <p className="text-sm text-secondary mb-4">
        Hourly rates per aircraft category; the rate covers the instructor. A logbook entry is charged at logbook flight time × rate + GST.
        A rate of 0 charges nothing. A different rate for one student is set on the Accounts page.
      </p>
      {!rates ? <p className="text-secondary py-4">Loading...</p> : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          {rates.map(r => (
            <div key={r.id} className="surface-inner rounded-lg p-3">
              <p className="font-semibold mb-2">{CATEGORY_LABEL[r.category]}</p>
              <label className="text-xs text-tertiary">Rate per hour (₹)
                <input inputMode="decimal" className={inputClass} value={valueOf(r).hourly_rate}
                  onChange={e => setDraft({ ...draft, [r.id]: { ...draft[r.id], hourly_rate: e.target.value } })} />
              </label>
              <label className="text-xs text-tertiary mt-2 block">GST %
                <input inputMode="decimal" className={inputClass} value={valueOf(r).gst_rate}
                  onChange={e => setDraft({ ...draft, [r.id]: { ...draft[r.id], gst_rate: e.target.value } })} />
              </label>
            </div>
          ))}
        </div>
      )}
      <button type="button" disabled={saving || !rates} onClick={saveRates} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer mb-6"
        style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}>{saving ? 'Saving...' : 'Save rates'}</button>

      <div className="surface-inner rounded-lg p-3">
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="mt-1" checked={block?.setting_value === 'true'} disabled={!block} onChange={e => toggleBlock(e.target.checked)} />
          <span>
            <span className="font-semibold">Block bookings the student&apos;s account can&apos;t cover</span>
            <span className="block text-xs text-tertiary">
              A booking is refused when balance + credit limit is less than its cost plus the student&apos;s other bookings not yet charged.
              Enter opening balances and credit limits on the Accounts page before switching this on.
            </span>
          </span>
        </label>
        {!block && settings && <p className="text-xs mt-2" style={{ color: 'var(--danger)' }}>Setting missing — run billing-b1.sql.</p>}
      </div>
    </div>
  );
}
