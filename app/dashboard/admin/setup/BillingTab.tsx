// app/dashboard/admin/setup/BillingTab.tsx — billing B1 (21 Oct; claude/billing-design-2026-10-20.md).
// School hourly rates per aircraft category (the rate covers the instructor) with GST %, and the switch that
// makes bookings need enough balance + credit. Per-student rates are set on the Accounts page.

'use client';

import { useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { ftoSettingsKey } from '@/lib/hooks/useFtoSettings';
import { notify } from '@/lib/notify';
import { todayIST } from '@/lib/ist';
import { CATEGORY_LABEL, formatINR, isGstin, type BillingCategory } from '@/lib/billing';
import { IndianRupee, Package } from 'lucide-react';
import ConfigTable, { type ConfigField, type ConfigColumn } from '@/components/admin/ConfigTable';

interface RateRow { id: number; category: BillingCategory; hourly_rate: number }
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
  const [draft, setDraft] = useState<Record<number, { hourly_rate?: string }>>({});
  const valueOf = (r: RateRow) => ({ hourly_rate: draft[r.id]?.hourly_rate ?? String(r.hourly_rate) });
  const [saving, setSaving] = useState(false);
  const block = settings?.find(s => s.setting_key === 'billing_booking_block');

  const patch = (endpoint: string, body: Record<string, unknown>) =>
    fetch(`/api/admin/config/${endpoint}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const saveRates = async () => {
    for (const r of rates ?? []) {
      const d = valueOf(r);
      if (!(Number(d.hourly_rate) >= 0) || d.hourly_rate.trim() === '') {
        notify(`${CATEGORY_LABEL[r.category]}: enter a rate of 0 or more.`);
        return;
      }
    }
    setSaving(true);
    try {
      for (const r of rates ?? []) {
        const d = valueOf(r);
        if (Number(d.hourly_rate) === Number(r.hourly_rate)) continue;
        const res = await patch('billing-rates', { id: r.id, hourly_rate: Number(d.hourly_rate) });
        if (!res.ok) {
          notify((await res.json().catch(() => ({}))).error || `Could not save the ${CATEGORY_LABEL[r.category]} rate.`);
          await mutate();
          return;
        }
      }
      await mutate();
      setDraft({});
      notify('✅ Rates saved.', 'success');
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
        Hourly rates per aircraft category; the rate covers the instructor. A logbook entry is charged at logbook flight time × rate + GST
        (the school GST rate below, in force on the flight date).
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
      <GstRatesSection />
      {settings && <FeesSection settings={settings} onSaved={() => { mutateSettings(); globalMutate(ftoSettingsKey); }} />}
      {settings && <GstSection settings={settings} onSaved={() => { mutateSettings(); globalMutate(ftoSettingsKey); }} />}
      {settings && <StartDateSection settings={settings} onSaved={() => { mutateSettings(); globalMutate(ftoSettingsKey); }} />}
      <div className="mt-6"><PackagesSection /></div>
    </div>
  );
}

// B3 (21 Oct): fees charged on top of flying. No-show is charged automatically; a late cancellation only when an
// admin ticks it while cancelling. The subject fee itself is set per subject in Admin Setup → Ground School.
const FEE_KEYS = [
  { key: 'billing_no_show_fee', label: 'No-show fee (₹, before GST)' },
  { key: 'billing_late_cancel_fee', label: 'Late-cancellation fee (₹, before GST)' },
] as const; // B5: fees use the school GST rate (GST rates above); billing_fee_gst_rate is no longer read

function FeesSection({ settings, onSaved }: { settings: SettingRow[]; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const rowOf = (key: string) => settings.find(s => s.setting_key === key);
  const valueOf = (key: string) => draft[key] ?? rowOf(key)?.setting_value ?? '';
  const missing = FEE_KEYS.some(f => !rowOf(f.key));

  const save = async () => {
    for (const f of FEE_KEYS) {
      const n = Number(valueOf(f.key));
      if (valueOf(f.key).trim() === '' || !(n >= 0)) {
        notify(`${f.label}: enter a number of 0 or more.`);
        return;
      }
    }
    setSaving(true);
    try {
      for (const f of FEE_KEYS) {
        const row = rowOf(f.key);
        if (!row || valueOf(f.key) === row.setting_value) continue;
        const res = await fetch('/api/admin/config/fto-settings', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: row.id, setting_value: String(Number(valueOf(f.key))) }),
        });
        if (!res.ok) { notify((await res.json().catch(() => ({}))).error || `Could not save ${f.label}.`); onSaved(); return; }
      }
      setDraft({});
      onSaved();
      notify('✅ Fees saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="surface-inner rounded-lg p-3 mt-4">
      <p className="font-semibold mb-1">Fees</p>
      <p className="text-xs text-tertiary mb-3">
        A no-show is charged when a booking is cancelled as &ldquo;Student no-show&rdquo;. A late cancellation is charged only when an admin ticks the fee
        while cancelling. Ground-school subject fees are set on each subject (Admin Setup → Ground School). 0 = no fee.
      </p>
      {missing ? <p className="text-xs" style={{ color: 'var(--danger)' }}>Fee settings missing — run billing-b3.sql.</p> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {FEE_KEYS.map(f => (
              <label key={f.key} className="text-xs text-tertiary">{f.label}
                <input inputMode="decimal" className={inputClass} value={valueOf(f.key)} onChange={e => setDraft({ ...draft, [f.key]: e.target.value })} />
              </label>
            ))}
          </div>
          <button type="button" disabled={saving} onClick={save} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer mt-3"
            style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}>{saving ? 'Saving...' : 'Save fees'}</button>
        </>
      )}
    </div>
  );
}

// B2 (21 Oct): course packages per training program — a fee (+ GST) that includes hours. Assigned on the Accounts page;
// a student's package keeps the fee and hours it was assigned with, so editing a package here changes only later ones.
interface PackageRow { id: number; program_id: number; name: string; fee: number; se_hours: number; me_hours: number; sim_hours: number; is_active: boolean }
interface ProgramRow { id: number; program_code: string; program_name: string }

function PackagesSection() {
  const { data: programs = [] } = useSWR('/api/admin/config/training-programs?orderBy=sort_order', rows<ProgramRow>);
  const programOf = (id: number) => programs.find(p => p.id === Number(id))?.program_code ?? '—';
  const hours = (n: number) => Number(n) || 0;
  const fields: ConfigField[] = [
    { name: 'program_id', type: 'select', default: '', label: 'Program', required: true,
      options: [{ label: '— Pick a program —', value: '' }, ...programs.map(p => ({ label: `${p.program_code} · ${p.program_name}`, value: String(p.id) }))] },
    { name: 'name', type: 'text', default: '', label: 'Package name', required: true, placeholder: 'e.g., PPL standard' },
    { name: 'fee', type: 'number', default: 0, label: 'Fee (₹, before GST)', step: '0.01' },
    { name: 'se_hours', type: 'number', default: 0, label: 'Single-engine hours included', step: '0.1' },
    { name: 'me_hours', type: 'number', default: 0, label: 'Multi-engine hours included', step: '0.1' },
    { name: 'sim_hours', type: 'number', default: 0, label: 'Simulator hours included', step: '0.1' },
    { name: 'is_active', type: 'checkbox', default: true, label: 'Active (can be assigned)', full: true },
  ];
  const columns: ConfigColumn<PackageRow>[] = [
    { header: 'Package', render: p => p.name, primary: true },
    { header: 'Program', render: p => <span className="badge badge-accent">{programOf(p.program_id)}</span> },
    { header: 'Fee', render: p => `${formatINR(Number(p.fee))} + GST` }, // B5: GST at the school rate on the day it is assigned
    { header: 'Hours included', render: p => [
      hours(p.se_hours) ? `SE ${hours(p.se_hours)} h` : null, hours(p.me_hours) ? `ME ${hours(p.me_hours)} h` : null, hours(p.sim_hours) ? `Sim ${hours(p.sim_hours)} h` : null,
    ].filter(Boolean).join(' · ') || '—' },
    { header: 'Status', render: p => <span className={`badge ${p.is_active ? 'badge-success' : 'badge-danger'}`}>{p.is_active ? 'Active' : 'Inactive'}</span> },
  ];
  return (
    <ConfigTable<PackageRow>
      title="Course packages"
      singular="Package"
      icon={<Package className="w-4 h-4 text-secondary" />}
      description="A course fee that includes hours. When a student flies, hours come out of their package first; the rest is charged at the hourly rate. Assign packages on the Accounts page. Editing a package doesn't change packages already assigned."
      table="course_packages"
      endpoint="course-packages"
      fields={fields}
      columns={columns}
      cols={3}
      deleteMessage="Delete this package? A package already assigned to a student can't be deleted — make it inactive instead."
      labelFor={p => p.name}
    />
  );
}

// B4 (22 Oct): GST details for receipts, invoices and credit notes. Invoices start once legal name, GSTIN and address
// are set (operator: receipt only until then). Each issued document keeps its own copy, so edits here never change one.
const GST_KEYS = [
  { key: 'billing_legal_name', label: 'Legal name' },
  { key: 'billing_gstin', label: 'GSTIN' },
  { key: 'billing_sac', label: 'SAC code (confirm with your CA)' },
  { key: 'billing_address', label: 'Registered address' },
  { key: 'billing_invoice_prefix', label: 'Invoice prefix' },
  { key: 'billing_receipt_prefix', label: 'Receipt prefix' },
  { key: 'billing_credit_note_prefix', label: 'Credit note prefix' },
] as const;

function GstSection({ settings, onSaved }: { settings: SettingRow[]; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const rowOf = (key: string) => settings.find(s => s.setting_key === key);
  const valueOf = (key: string) => draft[key] ?? rowOf(key)?.setting_value ?? '';
  const clean = (key: string) => (key === 'billing_gstin' || key.endsWith('_prefix') ? valueOf(key).trim().toUpperCase() : valueOf(key).trim());
  const missing = GST_KEYS.some(f => !rowOf(f.key));
  const saved = (key: string) => (rowOf(key)?.setting_value ?? '').trim();
  const invoicing = !!saved('billing_legal_name') && isGstin(saved('billing_gstin')) && !!saved('billing_address');

  const save = async () => {
    if (clean('billing_gstin') && !isGstin(clean('billing_gstin'))) { notify('GSTIN is not valid: check each of the 15 characters (the last one is a check character).'); return; }
    if (clean('billing_sac') && !/^[0-9]{4,8}$/.test(clean('billing_sac'))) { notify('SAC code: 4 to 8 digits.'); return; }
    if (GST_KEYS.some(f => f.key.endsWith('_prefix') && !/^[A-Z0-9-]{1,10}$/.test(clean(f.key)))) { notify('Prefixes: 1 to 10 letters, digits or dashes.'); return; }
    setSaving(true);
    try {
      for (const f of GST_KEYS) {
        const row = rowOf(f.key);
        if (!row || clean(f.key) === row.setting_value) continue;
        const res = await fetch('/api/admin/config/fto-settings', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, setting_value: clean(f.key) }),
        });
        if (!res.ok) { notify((await res.json().catch(() => ({}))).error || `Could not save ${f.label}.`); onSaved(); return; }
      }
      setDraft({});
      onSaved();
      notify('✅ GST details saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="surface-inner rounded-lg p-3 mt-4">
      <p className="font-semibold mb-1">GST, receipts and invoices</p>
      <p className="text-xs text-tertiary mb-1">
        Every payment gets a numbered receipt. Once legal name, GSTIN and address are set, a payment also gets a GST invoice for every charge not
        yet invoiced; voiding an invoiced charge issues a credit note. Numbers run per financial year: INV/2026-27/0001.
      </p>
      <p className="text-xs mb-3" style={{ color: invoicing ? 'var(--success)' : 'var(--danger)' }}>
        {invoicing ? 'Invoices: on.' : 'Invoices: off — receipts only until legal name, a valid GSTIN and address are saved.'}
        {' '}{isGstin(saved('billing_gstin')) ? 'GST is charged.' : 'No GST is charged on flights, fees or packages until a valid GSTIN is saved.'}
      </p>
      {missing ? <p className="text-xs" style={{ color: 'var(--danger)' }}>GST settings missing — run billing-b4.sql.</p> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {GST_KEYS.map(f => (
              <label key={f.key} className={`text-xs text-tertiary ${f.key === 'billing_address' ? 'sm:col-span-3' : ''}`}>{f.label}
                {f.key === 'billing_address'
                  ? <textarea rows={2} maxLength={300} className={inputClass} value={valueOf(f.key)} onChange={e => setDraft({ ...draft, [f.key]: e.target.value })} />
                  : <input maxLength={f.key === 'billing_legal_name' ? 150 : 20} className={inputClass} value={valueOf(f.key)} onChange={e => setDraft({ ...draft, [f.key]: e.target.value })} />}
              </label>
            ))}
          </div>
          <button type="button" disabled={saving} onClick={save} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer mt-3"
            style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}>{saving ? 'Saving...' : 'Save GST details'}</button>
        </>
      )}
    </div>
  );
}

// B4b (operator, 22 Oct: "add before billing"): flights logged before this date with nothing charged show as
// "Before billing" in the reconciliation report instead of "Not charged". Blank = no start date.
function StartDateSection({ settings, onSaved }: { settings: SettingRow[]; onSaved: () => void }) {
  const row = settings.find(s => s.setting_key === 'billing_start_date');
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? row?.setting_value ?? '';
  const save = async () => {
    if (!row) return;
    const res = await fetch('/api/admin/config/fto-settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, setting_value: value }),
    });
    if (!res.ok) { notify((await res.json().catch(() => ({}))).error || 'Could not save the billing start date.'); return; }
    setDraft(null);
    onSaved();
    notify('✅ Billing start date saved.');
  };
  return (
    <div className="surface-inner rounded-lg p-3 mt-4">
      <p className="font-semibold mb-1">Billing start date</p>
      <p className="text-xs text-tertiary mb-2">Logbook flights before this date that were never charged show as &ldquo;Before billing&rdquo; in Reports → Billing Reconciliation. Leave blank if none.</p>
      {!row ? <p className="text-xs" style={{ color: 'var(--danger)' }}>Setting missing — run billing-b4b.sql.</p> : (
        <div className="flex flex-wrap items-end gap-2">
          <input type="date" aria-label="Billing start date" className={`${inputClass} w-48`} value={value} onChange={e => setDraft(e.target.value)} />
          <button type="button" onClick={save} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer"
            style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}>Save date</button>
        </div>
      )}
    </div>
  );
}

// B5 (operator, 22 Oct): one school-wide GST rate with an effective-from history; the date of each charge picks the
// rate. Charged only once a valid GSTIN is saved. Past rates are locked; a future one can be deleted before it starts.
interface GstRateRow { id: number; rate: number; effective_from: string }
function GstRatesSection() {
  const { data: list, mutate } = useSWR('/api/admin/config/gst-rates?orderBy=effective_from', rows<GstRateRow>);
  const [rate, setRate] = useState('');
  const [from, setFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const today = todayIST();
  const current = [...(list ?? [])].filter(r => r.effective_from <= today).pop();
  const call = async (init: RequestInit, url = '/api/admin/config/gst-rates') => {
    setBusy(true);
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
      if (!res.ok) { notify((await res.json().catch(() => ({}))).error || 'Could not save the GST rate.'); return false; }
      await mutate();
      return true;
    } finally {
      setBusy(false);
    }
  };
  const add = async () => {
    const n = Number(rate);
    if (rate.trim() === '' || !(n >= 0 && n <= 100) || !/^\d{4}-\d{2}-\d{2}$/.test(from)) { notify('Enter a GST % from 0 to 100 and the date it takes effect.'); return; }
    if (await call({ method: 'POST', body: JSON.stringify({ rate: n, effective_from: from }) })) { setRate(''); setFrom(''); notify('✅ GST rate added.'); }
  };
  return (
    <div className="surface-inner rounded-lg p-3 mb-4" data-testid="gst-rates">
      <p className="font-semibold mb-1">GST rate</p>
      <p className="text-xs text-tertiary mb-2">
        One rate for flights, simulator, fees and packages. Each charge uses the rate in force on its date (the flight date for a logbook flight).
        No GST is charged until a valid GSTIN is saved below. Current: <span className="font-semibold">{current ? `${Number(current.rate)}% from ${current.effective_from}` : 'none set'}</span>.
      </p>
      <table className="text-sm mb-2">
        <thead><tr className="text-left text-xs text-tertiary"><th className="pr-4">From</th><th className="pr-4 text-right">GST %</th><th /></tr></thead>
        <tbody>
          {(list ?? []).map(r => (
            <tr key={r.id}><td className="pr-4">{r.effective_from}</td><td className="pr-4 text-right">{Number(r.rate)}%</td>
              <td>{r.effective_from > today && (
                <button type="button" disabled={busy} className="text-xs cursor-pointer" style={{ color: 'var(--danger)' }} aria-label={`Delete the GST rate from ${r.effective_from}`}
                  onClick={() => call({ method: 'DELETE' }, `/api/admin/config/gst-rates?id=${r.id}`)}>Delete</button>
              )}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-tertiary">New GST %<input inputMode="decimal" className={`${inputClass} w-28`} value={rate} onChange={e => setRate(e.target.value)} /></label>
        <label className="text-xs text-tertiary">Effective from<input type="date" className={`${inputClass} w-44`} value={from} onChange={e => setFrom(e.target.value)} /></label>
        <button type="button" disabled={busy} onClick={add} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer"
          style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}>Add rate</button>
      </div>
    </div>
  );
}

